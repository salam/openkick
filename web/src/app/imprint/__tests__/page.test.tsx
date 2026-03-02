import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ImprintPage from '../page';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock LanguageToggle
vi.mock('@/components/LanguageToggle', () => ({
  default: () => <div data-testid="language-toggle" />,
}));

// Mock i18n — return the key itself or a known translation
vi.mock('@/lib/i18n', () => ({
  getLanguage: () => 'en',
  t: (key: string) => {
    const translations: Record<string, string> = {
      imprint_title: 'Imprint',
      privacy_responsible: 'Responsible Entity',
      imprint_contact: 'Contact',
      legal_email: 'Contact Email',
      legal_phone: 'Phone',
      imprint_legal_ref: 'Information pursuant to §5 DDG, §5 ECG, Art. 3 OR',
      imprint_to_be_completed: 'to be completed',
      imprint_incomplete_notice: 'This imprint is being completed. For inquiries please contact {email}.',
      imprint_incomplete_notice_no_email: 'This imprint is being completed.',
    };
    return translations[key] || key;
  },
}));

function mockFetch(settings: Record<string, string>) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(settings),
  });
}

function fullSettings() {
  return {
    legal_org_name: 'FC Test',
    legal_address: '123 Main St\nTestville',
    legal_email: 'info@fctest.com',
    legal_phone: '+41 12 345 67 89',
    legal_responsible: 'John Doe',
    contact_info: 'https://fctest.com',
    club_name: 'FC Test Club',
    imprint_extra: 'Registered in Testville, ID 12345',
  };
}

describe('ImprintPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders normally when all settings populated — no incomplete notice, legal ref shown', async () => {
    mockFetch(fullSettings());
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('FC Test')).toBeInTheDocument();
    });

    // Legal ref header shown
    expect(screen.getByText('Information pursuant to §5 DDG, §5 ECG, Art. 3 OR')).toBeInTheDocument();

    // All fields shown
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
    expect(screen.getByText('info@fctest.com')).toBeInTheDocument();
    expect(screen.getByText('+41 12 345 67 89', { exact: false })).toBeInTheDocument();

    // imprint_extra shown
    expect(screen.getByText('Registered in Testville, ID 12345')).toBeInTheDocument();

    // No incomplete notice
    expect(screen.queryByText('This imprint is being completed.', { exact: false })).not.toBeInTheDocument();
  });

  it('renders placeholders when all settings empty — incomplete notice shown', async () => {
    mockFetch({
      legal_org_name: '', legal_address: '', legal_email: '',
      legal_phone: '', legal_responsible: '', contact_info: '',
      club_name: '', imprint_extra: '',
    });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('Information pursuant to §5 DDG, §5 ECG, Art. 3 OR')).toBeInTheDocument();
    });

    // Placeholders shown (orgName, address, responsible, plus email placeholder in contact section)
    const placeholders = screen.getAllByText('to be completed');
    expect(placeholders.length).toBe(4);

    // Incomplete notice without email
    expect(screen.getByText('This imprint is being completed.')).toBeInTheDocument();
  });

  it('uses club_name as org name fallback when no legal_org_name', async () => {
    mockFetch({
      legal_org_name: '', legal_address: '', legal_email: '',
      legal_phone: '', legal_responsible: '', contact_info: '',
      club_name: 'My Club', imprint_extra: '',
    });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('My Club')).toBeInTheDocument();
    });

    // orgName resolved from club_name, not placeholder
    // address + responsible + email placeholder in contact = 3
    const placeholders = screen.getAllByText('to be completed');
    expect(placeholders.length).toBe(3);
  });

  it('uses contact_info as email fallback when it contains @', async () => {
    mockFetch({
      legal_org_name: 'FC Test', legal_address: '123 Main St', legal_email: '',
      legal_phone: '', legal_responsible: 'John Doe',
      contact_info: 'contact@club.org',
      club_name: '', imprint_extra: '',
    });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('contact@club.org')).toBeInTheDocument();
    });

    // Since email resolved from contact_info, and all required fields are set,
    // there should be no incomplete notice
    expect(screen.queryByText('This imprint is being completed.', { exact: false })).not.toBeInTheDocument();
  });

  it('does NOT use contact_info as email fallback when it is a URL', async () => {
    mockFetch({
      legal_org_name: 'FC Test', legal_address: '123 Main St', legal_email: '',
      legal_phone: '', legal_responsible: 'John Doe',
      contact_info: 'https://fctest.com',
      club_name: '', imprint_extra: '',
    });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('FC Test')).toBeInTheDocument();
    });

    // email is empty → incomplete notice shown (with no email variant since contact_info is URL)
    // Actually contact_info is available and shown as link but NOT used as email fallback
    expect(screen.getByText('This imprint is being completed.')).toBeInTheDocument();
  });

  it('shows incomplete notice when partial settings (org + email set, address missing)', async () => {
    mockFetch({
      legal_org_name: 'FC Test', legal_address: '', legal_email: 'info@fctest.com',
      legal_phone: '', legal_responsible: '',
      contact_info: '', club_name: '', imprint_extra: '',
    });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('FC Test')).toBeInTheDocument();
    });

    // address and responsible are placeholders
    const placeholders = screen.getAllByText('to be completed');
    expect(placeholders.length).toBe(2);

    // Incomplete notice with email
    expect(
      screen.getByText('This imprint is being completed. For inquiries please contact info@fctest.com.')
    ).toBeInTheDocument();
  });

  it('uses dpo_email as email fallback when no legal_email or contact_info email', async () => {
    mockFetch({
      legal_org_name: 'FC Test', legal_address: '123 Main St', legal_email: '',
      legal_phone: '', legal_responsible: 'John Doe',
      contact_info: 'https://fctest.com',
      club_name: '', imprint_extra: '', dpo_email: 'dpo@fctest.com',
    });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('dpo@fctest.com')).toBeInTheDocument();
    });

    // dpo_email resolved as email fallback, all required fields set → no incomplete notice
    expect(screen.queryByText('This imprint is being completed.', { exact: false })).not.toBeInTheDocument();
  });

  it('does NOT use contact_info with @ in non-email context as email fallback', async () => {
    mockFetch({
      legal_org_name: 'FC Test', legal_address: '123 Main St', legal_email: '',
      legal_phone: '', legal_responsible: 'John Doe',
      contact_info: 'Call us @ 123-456',
      club_name: '', imprint_extra: '',
    });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('FC Test')).toBeInTheDocument();
    });

    // contact_info contains @ but is not a valid email → not used as fallback
    expect(screen.getByText('This imprint is being completed.')).toBeInTheDocument();
  });

  it('shows imprint_extra when set, hides when empty', async () => {
    // With imprint_extra
    mockFetch({ ...fullSettings(), imprint_extra: 'Extra legal text' });
    const { unmount } = render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('Extra legal text')).toBeInTheDocument();
    });
    unmount();

    // Without imprint_extra
    mockFetch({ ...fullSettings(), imprint_extra: '' });
    render(<ImprintPage />);

    await waitFor(() => {
      expect(screen.getByText('FC Test')).toBeInTheDocument();
    });
    expect(screen.queryByText('Extra legal text')).not.toBeInTheDocument();
  });
});
