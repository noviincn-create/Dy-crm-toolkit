/** Element ids, storage keys and business constants of the opportunity tools. */

export const BTN_ID = "dy-close-btn";
export const DLG_ID = "dy-close-dlg";
export const FAB_ID = "dy-fab";
export const CSS_ID = "dy-close-css";

// localStorage keys
export const LS_KEY = "dyEasyClose.stageDefaults";
export const SEQ_KEY = "dyEasyClose.sequential"; // '1' = old stage-by-stage Close as Won; default = one direct jump to the last stage
export const FAB_KEY = "dyEasyClose.fabMin";
export const SES_KEY = "dyEasyClose.session"; // {oppId, name, number, startedAt}
export const SES_OPEN_KEY = "dyEasyClose.sessionPanelOpen";
export const SES_OPENFORM_KEY = "dyEasyClose.sessionOpenForm";

// monthly opportunity number
export const NUM_FIELD = "new_opportunitynumbertext"; // Single Line of Text field (no thousand separators, keeps leading zeros)
export const NUM_LEGACY = "new_opportunitynumber"; // old Whole Number field: never written any more, but its numbers still count as used
export const NUM_MAX_ATTEMPTS = 6; // PATCH attempts (collision / concurrency retries) per assignment run
export const NUM_MAX_SEQ = 9999;

/** Product number added to the opportunity when a session ends; quantity = session minutes (rounded up, min 1). */
export const END_PRODUCT = "INT-009";
