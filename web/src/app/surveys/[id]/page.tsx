import SurveyDetailClient from './SurveyDetailClient';

export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function SurveyDetailPage() {
  return <SurveyDetailClient />;
}
