/** KYC content script (ISOLATED world, Dynamics main.aspx pages). Mounts the panel at the top of the Quick Create form. */
import { findMount, setFormRoot } from "./form";
import { KycPanel } from "./panel";

if (!window.__kycLoaded) {
  window.__kycLoaded = true;

  const panel = new KycPanel();
  let timer = 0;

  const mount = (): void => {
    timer = 0;
    const found = findMount();
    if (!found || (panel.host.isConnected && found.body.contains(panel.host))) return;
    if (document.querySelectorAll("#kyc-root").length && !panel.host.isConnected) return; // another block already mounted
    setFormRoot(found.body.parentElement ?? found.body);
    panel.setKind(found.kind);
    found.body.prepend(panel.host);
  };

  const schedule = (): void => {
    timer ||= window.setTimeout(mount, 250);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule(); // the Quick Create panel may already be open when the script is injected
}
