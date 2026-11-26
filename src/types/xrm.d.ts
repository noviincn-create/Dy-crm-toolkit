/**
 * Minimal ambient typings for the parts of the Dynamics 365 (on-prem 9.1) client API that the toolkit uses.
 * Only what is called in the code is declared; this is not a full Xrm typing.
 */

interface XrmAttribute {
  getAttributeType(): string;
  getValue(): unknown;
  setValue(value: unknown): void;
  fireOnChange?(): void;
}

interface XrmProcessStep {
  getAttribute?(): string;
  getName?(): string;
  isRequired?(): boolean;
  required?: boolean;
}

interface XrmProcessStage {
  getId(): string;
  getName(): string;
  getSteps(): XrmProcessStep[] | null;
}

interface XrmStagePath {
  get(index: number): XrmProcessStage;
  getLength(): number;
}

interface XrmProcess {
  getActiveStage?(): XrmProcessStage | null;
  getActivePath(): XrmStagePath;
  getActiveProcess?(): { getId(): string } | null;
  moveNext(callback: (result: string) => void): void;
  setStatus?(status: string, callback: () => void): void;
  setActiveStage(stageId: string, callback: (result: string) => void): void;
}

interface XrmEntity {
  getEntityName(): string;
  getId(): string;
  getPrimaryAttributeValue?(): string;
}

interface XrmFormData {
  entity: XrmEntity;
  process?: XrmProcess;
  getIsDirty(): boolean;
  save(): Promise<unknown>;
  refresh(save: boolean): Promise<unknown>;
}

/** `Xrm.Page` (deprecated but still the form context on 9.1 on-prem). */
interface XrmFormContext {
  data: XrmFormData;
  getAttribute(name: string): XrmAttribute | null;
}

interface XrmGlobalContext {
  getClientUrl(): string;
  userSettings: { userId: string; transactionCurrency?: { id?: string } };
}

interface XrmEntityFormOptions {
  entityName: string;
  entityId?: string;
  useQuickCreateForm?: boolean;
  createFromEntity?: { entityType: string; id: string; name: string };
}

interface XrmStatic {
  Page?: XrmFormContext;
  Utility: { getGlobalContext(): XrmGlobalContext };
  Navigation: { openForm(options: XrmEntityFormOptions, parameters?: Record<string, unknown>): Promise<unknown> };
}

interface Window {
  Xrm?: XrmStatic;
  __dyEasyClose?: boolean;
  __dyOppNumber?: import("../close/opp-number").OppNumberApi;
  __dyInvoicePrint?: boolean;
  __dyInvoiceKey?: (e: KeyboardEvent) => boolean;
  __dyInvoice?: import("../invoice/content").InvoiceDebugApi;
  __kycLoaded?: boolean;
}
