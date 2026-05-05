import { createClient } from '@/lib/supabase/client'
import type {
  LedgerAccount,
  LedgerAccountInsert,
  Transaction,
  TransactionInsert,
  TransactionUpdate,
  TransactionWithRelations,
  ExpenseCategory,
  TransactionType,
  Project,
} from '@/lib/supabase/types'

// ── Display labels (kept here so UI and selects stay in sync) ───────────────

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  salary: 'Salary',
  office: 'Office expense',
  software: 'Software',
  marketing_sales: 'Marketing & Sales',
  charges: 'Charges',
  other: 'Other',
}

export const EXPENSE_CATEGORY_ORDER: ExpenseCategory[] = [
  'salary', 'office', 'software', 'marketing_sales', 'charges', 'other',
]

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Expense',
  collection: 'Collection',
  transfer: 'Transfer',
  opening_balance: 'Opening balance',
  other_income: 'Other income',
}

export const EXPENSE_CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  salary:          '#378add',
  office:          '#8b949e',
  software:        '#8b5cf6',
  marketing_sales: '#ec4899',
  charges:         '#ef9f27',
  other:           '#6e7681',
}

// ── Accounts ────────────────────────────────────────────────────────────────

export async function getLedgerAccounts() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('ledger_accounts')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as LedgerAccount[]
}

export async function createLedgerAccount(account: LedgerAccountInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('ledger_accounts')
    .insert(account)
    .select()
    .single()
  if (error) throw error
  return data as LedgerAccount
}

// ── Transactions ────────────────────────────────────────────────────────────

export interface TransactionFilters {
  accountId?: string
  type?: TransactionType
  category?: ExpenseCategory
  projectId?: string
  direction?: 'in' | 'out'
  fromDate?: string
  toDate?: string
}

export async function getTransactions(filters: TransactionFilters = {}) {
  const supabase = createClient()
  let q = supabase
    .from('transactions')
    .select('*, ledger_accounts(*), projects(*), people(*)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.accountId)  q = q.eq('account_id', filters.accountId)
  if (filters.type)       q = q.eq('type', filters.type)
  if (filters.category)   q = q.eq('expense_category', filters.category)
  if (filters.projectId)  q = q.eq('project_id', filters.projectId)
  if (filters.direction)  q = q.eq('direction', filters.direction)
  if (filters.fromDate)   q = q.gte('date', filters.fromDate)
  if (filters.toDate)     q = q.lte('date', filters.toDate)

  const { data, error } = await q
  if (error) throw error
  return data as TransactionWithRelations[]
}

export async function insertTransaction(tx: TransactionInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('transactions')
    .insert(tx)
    .select()
    .single()
  if (error) throw error
  return data as Transaction
}

export async function insertTransferPair(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  date: string,
  notes: string | null,
  reference: string | null,
) {
  const supabase = createClient()
  const pairId = crypto.randomUUID()
  const { error } = await supabase.from('transactions').insert([
    {
      account_id: fromAccountId,
      date,
      direction: 'out',
      amount,
      type: 'transfer',
      transfer_pair_id: pairId,
      reference,
      notes,
    },
    {
      account_id: toAccountId,
      date,
      direction: 'in',
      amount,
      type: 'transfer',
      transfer_pair_id: pairId,
      reference,
      notes,
    },
  ])
  if (error) throw error
  return pairId
}

export interface UpdateTransactionPatch {
  date?: string
  amount?: number
  expense_category?: ExpenseCategory | null
  project_id?: string | null
  person_id?: string | null
  counterparty?: string | null
  reference?: string | null
  notes?: string | null
  account_id?: string
}

/**
 * Update a transaction. For transfer rows, the patch is mirrored onto both
 * paired rows (so date/amount/notes/reference stay in sync). Type and
 * direction are immutable — to change those, delete and recreate.
 */
export async function updateTransaction(
  id: string,
  transferPairId: string | null,
  patch: UpdateTransactionPatch,
) {
  const supabase = createClient()

  if (transferPairId) {
    // Transfers: only mirror the fields that should be shared on both sides.
    // account_id is intentionally NOT mirrored — each row stays attached to
    // its own account.
    const sharedPatch: UpdateTransactionPatch = {
      date: patch.date,
      amount: patch.amount,
      reference: patch.reference,
      notes: patch.notes,
    }
    const cleaned = stripUndefined(sharedPatch)
    const { error } = await supabase
      .from('transactions')
      .update(cleaned)
      .eq('transfer_pair_id', transferPairId)
    if (error) throw error
    return
  }

  const cleaned = stripUndefined(patch)
  const { error } = await supabase
    .from('transactions')
    .update(cleaned)
    .eq('id', id)
  if (error) throw error
}

// Strip undefined keys so a partial update doesn't overwrite columns with NULL.
function stripUndefined(patch: UpdateTransactionPatch): TransactionUpdate {
  const out: TransactionUpdate = {}
  if (patch.date             !== undefined) out.date             = patch.date
  if (patch.amount           !== undefined) out.amount           = patch.amount
  if (patch.expense_category !== undefined) out.expense_category = patch.expense_category
  if (patch.project_id       !== undefined) out.project_id       = patch.project_id
  if (patch.person_id        !== undefined) out.person_id        = patch.person_id
  if (patch.counterparty     !== undefined) out.counterparty     = patch.counterparty
  if (patch.reference        !== undefined) out.reference        = patch.reference
  if (patch.notes            !== undefined) out.notes            = patch.notes
  if (patch.account_id       !== undefined) out.account_id       = patch.account_id
  return out
}

export async function deleteTransaction(id: string, transferPairId: string | null) {
  const supabase = createClient()
  // For transfers, deleting one row leaves the ledger imbalanced. Delete the pair.
  if (transferPairId) {
    const { error } = await supabase.from('transactions').delete().eq('transfer_pair_id', transferPairId)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}

// ── Derived calculations (pure functions) ───────────────────────────────────

export function accountBalance(transactions: Transaction[], accountId: string): number {
  let balance = 0
  for (const t of transactions) {
    if (t.account_id !== accountId) continue
    balance += t.direction === 'in' ? Number(t.amount) : -Number(t.amount)
  }
  return balance
}

export function projectCollected(transactions: Transaction[], projectId: string): number {
  let total = 0
  for (const t of transactions) {
    if (t.project_id === projectId && t.type === 'collection') {
      total += Number(t.amount)
    }
  }
  return total
}

export interface ProjectCollectionSummary {
  project: Project
  salesValue: number
  collected: number
  outstanding: number
  lastCollectionDate: string | null
  collectionCount: number
}

export function buildCollectionSummaries(
  projects: Project[],
  transactions: Transaction[],
): ProjectCollectionSummary[] {
  const collectionsByProject = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.type !== 'collection' || !t.project_id) continue
    const arr = collectionsByProject.get(t.project_id) ?? []
    arr.push(t)
    collectionsByProject.set(t.project_id, arr)
  }

  return projects
    .filter(p => p.status !== 'lost' && (p.sales_value ?? 0) > 0)
    .map(p => {
      const tx = (collectionsByProject.get(p.id) ?? [])
      const collected = tx.reduce((s, t) => s + Number(t.amount), 0)
      const salesValue = p.sales_value ?? 0
      const lastCollectionDate = tx.length
        ? tx.map(t => t.date).sort().slice(-1)[0]
        : null
      return {
        project: p,
        salesValue,
        collected,
        outstanding: Math.max(0, salesValue - collected),
        lastCollectionDate,
        collectionCount: tx.length,
      }
    })
}
