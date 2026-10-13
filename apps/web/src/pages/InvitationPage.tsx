import { useParams } from 'react-router';
import { InvitationScreen } from '@/features/households/InvitationScreen';

/** `/einladung/:token` – public invitation preview + accept. */
export function InvitationPage() {
  const { token = '' } = useParams<{ token: string }>();
  return <InvitationScreen key={token} token={token} />;
}
