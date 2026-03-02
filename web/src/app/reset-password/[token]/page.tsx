import ResetPasswordClient from './ResetPasswordClient';

export async function generateStaticParams() {
  return [{ token: '_' }];
}

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
