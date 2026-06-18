import { redirect } from 'next/navigation';

export default async function ThreadRoute({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  redirect(`/inbox?threadId=${threadId}`);
}
