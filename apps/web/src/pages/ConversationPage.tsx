// PLACEHOLDER – replaced by the chat feature team
import { GlassButton } from '@/components/GlassButton';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

export function ConversationPage() {
  const goBack = useGoBack(paths.chats);
  return (
    <Screen
      header={<LargeTitleHeader title="Chat" leading={<GlassButton icon="chevL" label="Zurück" onClick={goBack} />} />}
    >
      <p>Der Verlauf folgt.</p>
    </Screen>
  );
}
