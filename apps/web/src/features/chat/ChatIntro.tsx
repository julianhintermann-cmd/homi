import type { ReactNode } from 'react';

export interface ChatIntroProps {
  /** 80 px avatar (initial 32 / 600) or the household avatar. */
  avatar: ReactNode;
  title: string;
  /** "Mitglied von Unser Zuhause" (`footnote` label-secondary). */
  subtitle: string;
  /** "Schreib Max die erste Nachricht." (`subhead` label-secondary). */
  hint: string;
}

/**
 * Empty conversation (design 08d): avatar 80 at safe-top + 246, name `title2` 16 px below,
 * membership line 4 px below, hint 24 px below – all centred.
 */
export function ChatIntro({ avatar, title, subtitle, hint }: ChatIntroProps) {
  return (
    <section className="chat-intro" aria-label={`Neuer Chat mit ${title}`}>
      <span className="chat-intro__avatar">{avatar}</span>
      <h2 className="chat-intro__title">{title}</h2>
      <p className="chat-intro__subtitle">{subtitle}</p>
      <p className="chat-intro__hint">{hint}</p>
    </section>
  );
}
