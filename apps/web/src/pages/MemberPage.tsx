import { useParams } from 'react-router';
import { MemberScreen } from '@/features/households/MemberScreen';

/** `/haushalt/mitglieder/:userId` – member detail with the permitted actions. */
export function MemberPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  return <MemberScreen key={userId} userId={userId} />;
}
