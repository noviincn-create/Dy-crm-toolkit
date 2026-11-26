/** Where the dashboard runs: set by the page entry before it opens. */
export const env: { crmUrl: string; managed: boolean; onClose: (() => void) | null } = {
  /** CRM address (record links, error hints). */
  crmUrl: "",
  /** true = the entry installed the Web API transport itself (extension page). */
  managed: false,
  onClose: null,
};
