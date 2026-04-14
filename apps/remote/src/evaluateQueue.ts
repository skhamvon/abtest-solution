let chain: Promise<void> = Promise.resolve();

/**
 * Sérialise les tâches d'évaluation / injection (évite les courses au chargement MF).
 */
export function enqueueAbtestTask(task: () => Promise<void>): void {
  chain = chain.then(task).catch(() => {});
}
