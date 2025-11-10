import BookProviderClient from './BookProviderClient';

export default function BookProviderPage({ params }: { params: { id: string } }) {
  return <BookProviderClient providerId={params.id} />;
}
