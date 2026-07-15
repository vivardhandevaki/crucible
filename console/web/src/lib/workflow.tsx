import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** What the workflow context bar shows: where in the pipeline the user is.
 *  Screens publish their scope via useSetWorkflow; the bar in App renders it. */
export interface WorkflowScope {
  /** Human label for the current screen when no single work order is in focus. */
  section: string;
  /** The work order under focus, if any. */
  feature?: { id: string; title?: string };
  /** The state-machine stage, if known (drives the phase rail). */
  stage?: string;
}

interface Ctx {
  scope: WorkflowScope;
  set: (s: WorkflowScope) => void;
}

const WorkflowContext = createContext<Ctx>({ scope: { section: "" }, set: () => {} });

export function WorkflowProvider({ children }: { children: ReactNode }): ReactNode {
  const [scope, set] = useState<WorkflowScope>({ section: "" });
  const value = useMemo(() => ({ scope, set }), [scope]);
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflowScope(): WorkflowScope {
  return useContext(WorkflowContext).scope;
}

/** Screens call this to publish where the user is. Cheap to call every render. */
export function useSetWorkflow(scope: WorkflowScope): void {
  const { set } = useContext(WorkflowContext);
  const key = `${scope.section}|${scope.feature?.id ?? ""}|${scope.feature?.title ?? ""}|${scope.stage ?? ""}`;
  useEffect(() => { set(scope); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The 5 human-legible phases the 15 states collapse into, for the phase rail. */
export const PHASES = ["Spec", "Oracles", "Build", "Review", "Ship"] as const;
export type Phase = (typeof PHASES)[number];

const STATE_PHASE: Record<string, Phase> = {
  DRAFT_SPEC: "Spec", SPEC_APPROVED: "Spec",
  ORACLES_AUTHORED: "Oracles", ORACLES_APPROVED: "Oracles",
  PACKAGED: "Build", IMPLEMENTING: "Build",
  PR_OPEN: "Review", GATES_GREEN: "Review", AI_REVIEWED: "Review",
  ROUTED_AUTO: "Review", ROUTED_HUMAN: "Review",
  MERGED: "Ship", CANARY: "Ship", DONE: "Ship",
};

export function phaseOf(state: string | undefined): Phase | null {
  return state ? STATE_PHASE[state] ?? null : null;
}
