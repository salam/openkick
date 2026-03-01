import SurveyRespondClient from './SurveyRespondClient';

export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function SurveyRespondPage() {
  return <SurveyRespondClient />;
}
