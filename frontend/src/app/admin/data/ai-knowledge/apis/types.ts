import type { AdminListRow } from "../../../components/admin-placeholder-view";
import type { KnowledgeTab } from "../types";

export type KnowledgeByTab = Record<KnowledgeTab, AdminListRow[]>;
