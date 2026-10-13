import { checkPasswordPolicy } from '@homi/shared';
import { Icon } from '@/components';

export interface PasswordPolicyHintsProps {
  password: string;
  /** Adds the "not your e-mail address" rule when known. */
  email?: string | null;
  id?: string;
}

/**
 * Live checklist of the password policy (§4.2) under a new-password field: each rule turns from
 * label-3 to accent once met. Screen readers get the state as text; the list is linked to the
 * field via `aria-describedby` (no live announcements on every keystroke).
 */
export function PasswordPolicyHints({ password, email, id }: PasswordPolicyHintsProps) {
  const rules = checkPasswordPolicy(password, email);
  return (
    <ul id={id} className="auth-policy" aria-label="Anforderungen an das Passwort">
      {rules.map((rule) => (
        <li key={rule.id} className="auth-policy__item" data-met={rule.met || undefined}>
          <Icon name="checkCircle" size={16} weight={1.5} className="auth-policy__icon" />
          <span>{rule.label}</span>
          <span className="visually-hidden">{rule.met ? ' – erfüllt' : ' – noch nicht erfüllt'}</span>
        </li>
      ))}
    </ul>
  );
}
