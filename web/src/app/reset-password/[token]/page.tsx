import ResetPasswordClient from './ResetPasswordClient';

export async function generateStaticParams() {
  return [{ token: '_placeholder' }];
}

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
