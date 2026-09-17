export interface BlocklistTermRecord {
  id: string;
  term: string;
  createdAt: string;
}

export interface CreateBlocklistTermInput {
  tenantId: string;
  term: string;
}

export interface DeleteBlocklistTermInput {
  id: string;
  tenantId: string;
}
