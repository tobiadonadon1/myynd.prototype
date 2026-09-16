import type { ProjectInitiative } from './api.ts'
/** An editable discussion draft only. Opening a card must never send or save it. */
export function projectInitiativeDraft(item: ProjectInitiative, language: 'en' | 'it'): string {
  return language === 'it'
    ? `Parliamo di «${item.projectName}». L'obiettivo salvato è: «${item.goal}». ${item.taskId ? `Il passo aperto è: «${item.title}». Aiutami a chiarire come procedere.` : `Aiutami a chiarire questo punto: ${item.question ?? 'Qual è il prossimo passo concreto?'}`}`
    : `Let's discuss «${item.projectName}». The saved goal is: «${item.goal}». ${item.taskId ? `The open step is: «${item.title}». Help me clarify how to proceed.` : `Help me clarify this question: ${item.question ?? 'What is the next concrete step?'}`}`
}
