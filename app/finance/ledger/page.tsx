'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatINR, formatINRFull } from '@/lib/utils/currency'
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_CATEGORY_COLOR,
  TRANSACTION_TYPE_LABEL,
  deleteTransaction,
} from '@/lib/queries/ledger'
import { FinanceNav } from '@/components/finance/FinanceNav'
import { AddTransactionDialog } from '@/components/finance/AddTransactionDialog'
import { AddAccountDialog } from '@/components/finance/AddAccountDialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  Wallet,
  Banknote,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Sparkles,
  PlusCircle,
  Trash2,
  Pencil,
  Filter,
  Search,
  AlertTriangle,
} from 'lucide-react'
import type {
  LedgerAccount,
  TransactionType,
  TransactionWithRelations,
  ExpenseCategory,
} from '@/lib/supabase/types'

const TYPE_ICON: Record<TransactionType, typeof Wallet> = {
  expense:         ArrowUpCircle,
  collection:      ArrowDownCircle,
  transfer:        ArrowLeftRight,
  opening_balance: Sparkles,
  other_income:    PlusCircle,
}

const TYPE_COLOR: Record<TransactionType, string> = {
  expense:         '#e24b4a',
  collection:      '#1d9e75',
  transfer:        '#378add',
  opening_balance: '#8b5cf6',
  other_income:    '#1d9e75',
}

export default function LedgerPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [selectedAccount, setSelectedAccount] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [search, setSearch] = useState('')
  const [showAddTx, setShowAddTx] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [editingTx, setEditingTx] = useState<TransactionWithRelations | null>(null)
  const [deletingTx, setDeletingTx] = useState<TransactionWithRelations | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['ledger_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_accounts').select('*').order('created_at', { ascending: true })
      if (error) throw error
      return data as LedgerAccount[]
    },
  })

  const { data: transactions, isLoading: loadingTx } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, ledger_accounts(*), projects(*), people(*)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TransactionWithRelations[]
    },
  })

  const isLoading = loadingAccounts || loadingTx

  const deleteMutation = useMutation({
    mutationFn: async (tx: TransactionWithRelations) => {
      await deleteTransaction(tx.id, tx.transfer_pair_id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  // ── Account balances ──────────────────────────────────────────────────────
  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions ?? []) {
      const cur = map.get(t.account_id) ?? 0
      map.set(t.account_id, cur + (t.direction === 'in' ? Number(t.amount) : -Number(t.amount)))
    }
    return map
  }, [transactions])

  const totalBalance = useMemo(
    () => [...(balances.values())].reduce((s, b) => s + b, 0),
    [balances],
  )

  // ── Filtered transactions + running balance ──────────────────────────────
  const filteredTransactions = useMemo(() => {
    const all = transactions ?? []
    const byAcc = selectedAccount === 'all' ? all : all.filter(t => t.account_id === selectedAccount)
    return byAcc.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (categoryFilter !== 'all' && t.expense_category !== categoryFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = [
          t.counterparty, t.reference, t.notes,
          t.projects?.name, t.projects?.client_name,
          t.people?.name, t.ledger_accounts?.name,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [transactions, selectedAccount, typeFilter, categoryFilter, search])

  // Running balance only meaningful when a single account is selected
  const txWithRunningBalance = useMemo(() => {
    if (selectedAccount === 'all') return filteredTransactions.map(t => ({ tx: t, running: null as number | null }))

    // Compute oldest-first then assign running balance, then reverse for display
    const ascending = [...filteredTransactions].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.created_at.localeCompare(b.created_at)
    })
    let running = 0
    const map = new Map<string, number>()
    for (const t of ascending) {
      running += t.direction === 'in' ? Number(t.amount) : -Number(t.amount)
      map.set(t.id, running)
    }
    return filteredTransactions.map(t => ({ tx: t, running: map.get(t.id) ?? null }))
  }, [filteredTransactions, selectedAccount])

  // ── Empty state — no accounts yet ─────────────────────────────────────────
  if (!isLoading && (accounts ?? []).length === 0) {
    return (
      <div className="p-6 space-y-6 min-h-screen bg-[#0d1117]">
        <FinanceNav />
        <EmptyState onAddAccount={() => setShowAddAccount(true)} />
        <AddAccountDialog open={showAddAccount} onClose={() => setShowAddAccount(false)} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0d1117]">
      <FinanceNav />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Ledger</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            Cash &amp; bank accounts · expense tracking · project collections
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddAccount(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-xs transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add account
          </button>
          <button
            onClick={() => setShowAddTx(true)}
            disabled={(accounts ?? []).length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            New transaction
          </button>
        </div>
      </div>

      {/* ── Account cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <AccountCard
          name="All accounts"
          balance={totalBalance}
          isAll
          isActive={selectedAccount === 'all'}
          onClick={() => setSelectedAccount('all')}
        />
        {(accounts ?? []).map(a => (
          <AccountCard
            key={a.id}
            name={a.name}
            type={a.type}
            balance={balances.get(a.id) ?? 0}
            isActive={selectedAccount === a.id}
            onClick={() => setSelectedAccount(a.id)}
          />
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2.5">
        <Filter className="h-3.5 w-3.5 text-[#6e7681] flex-shrink-0" />

        <select
          className="text-xs bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as 'all' | TransactionType)}
        >
          <option value="all">All types</option>
          {(Object.keys(TRANSACTION_TYPE_LABEL) as TransactionType[]).map(t => (
            <option key={t} value={t}>{TRANSACTION_TYPE_LABEL[t]}</option>
          ))}
        </select>

        {typeFilter === 'expense' && (
          <select
            className="text-xs bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as 'all' | ExpenseCategory)}
          >
            <option value="all">All categories</option>
            {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map(c => (
              <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        )}

        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 text-[#6e7681] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="w-full text-xs bg-[#0d1117] border border-[#30363d] rounded-md pl-8 pr-2 py-1.5 text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
            placeholder="Search counterparty, reference, project, notes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {(typeFilter !== 'all' || categoryFilter !== 'all' || search) && (
          <button
            onClick={() => { setTypeFilter('all'); setCategoryFilter('all'); setSearch('') }}
            className="text-[11px] text-[#8b949e] hover:text-[#e6edf3] underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Transactions table ───────────────────────────────────────── */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#e6edf3]">Transactions</h2>
          <span className="text-xs text-[#6e7681]">
            {filteredTransactions.length} entr{filteredTransactions.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 bg-[#21262d]" />)}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[#8b949e]">No transactions match the current filters.</p>
            {(transactions ?? []).length === 0 && (
              <button
                onClick={() => setShowAddTx(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#58a6ff] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Record the first transaction
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Date</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Type</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Description</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden md:table-cell">Account</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide">Amount</th>
                  {selectedAccount !== 'all' && (
                    <th className="text-right px-3 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide hidden lg:table-cell">Balance</th>
                  )}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {txWithRunningBalance.map(({ tx, running }, i) => {
                  const Icon = TYPE_ICON[tx.type]
                  const color = TYPE_COLOR[tx.type]
                  const isOut = tx.direction === 'out'

                  return (
                    <tr
                      key={tx.id}
                      className={cn(
                        'border-b border-[#30363d]/60 last:border-0 hover:bg-[#21262d]/40 transition-colors group',
                        i % 2 === 1 && 'bg-[#0d1117]/30',
                      )}
                    >
                      <td className="px-5 py-3 whitespace-nowrap text-xs text-[#c9d1d9] tabular-nums">
                        {format(parseISO(tx.date), 'dd MMM yy')}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                          <span className="text-xs text-[#c9d1d9]">{TRANSACTION_TYPE_LABEL[tx.type]}</span>
                        </div>
                        {tx.expense_category && (
                          <span
                            className="inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: EXPENSE_CATEGORY_COLOR[tx.expense_category] + '22',
                              color: EXPENSE_CATEGORY_COLOR[tx.expense_category],
                            }}
                          >
                            {EXPENSE_CATEGORY_LABEL[tx.expense_category]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-[300px]">
                        <div className="text-xs text-[#c9d1d9] truncate">
                          {describeTransaction(tx)}
                        </div>
                        {(tx.reference || tx.notes) && (
                          <div className="text-[11px] text-[#6e7681] truncate mt-0.5">
                            {tx.reference && <span className="font-mono mr-2">{tx.reference}</span>}
                            {tx.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell text-xs text-[#8b949e]">
                        {tx.ledger_accounts?.name ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                        <span
                          className="text-sm font-medium"
                          style={{ color: isOut ? '#e24b4a' : '#1d9e75' }}
                        >
                          {isOut ? '−' : '+'}{formatINR(Number(tx.amount))}
                        </span>
                      </td>
                      {selectedAccount !== 'all' && (
                        <td className="px-3 py-3 text-right hidden lg:table-cell tabular-nums text-xs text-[#8b949e]">
                          {running !== null ? formatINRFull(running) : '—'}
                        </td>
                      )}
                      <td className="px-2 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => setEditingTx(tx)}
                            className="p-1 text-[#6e7681] hover:text-[#58a6ff] rounded transition-colors"
                            title="Edit transaction"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingTx(tx)}
                            className="p-1 text-[#6e7681] hover:text-[#e24b4a] rounded transition-colors"
                            title={tx.transfer_pair_id ? 'Delete transfer (both sides)' : 'Delete transaction'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddTransactionDialog open={showAddTx} onClose={() => setShowAddTx(false)} />
      <AddTransactionDialog
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        editTransaction={editingTx}
      />
      <AddAccountDialog open={showAddAccount} onClose={() => setShowAddAccount(false)} />
      <DeleteTransactionModal
        tx={deletingTx}
        onClose={() => setDeletingTx(null)}
        onConfirm={tx => {
          deleteMutation.mutate(tx, {
            onSuccess: () => setDeletingTx(null),
          })
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

// ── Delete confirmation modal ────────────────────────────────────────────

interface DeleteTransactionModalProps {
  tx: TransactionWithRelations | null
  onClose: () => void
  onConfirm: (tx: TransactionWithRelations) => void
  isPending: boolean
}

function DeleteTransactionModal({ tx, onClose, onConfirm, isPending }: DeleteTransactionModalProps) {
  if (!tx) return null

  const isTransfer = !!tx.transfer_pair_id
  const Icon = TYPE_ICON[tx.type]
  const color = TYPE_COLOR[tx.type]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-[#e24b4a] flex-shrink-0" />
          <h2 className="text-sm font-semibold text-[#e6edf3]">
            {isTransfer ? 'Delete transfer' : 'Delete transaction'}
          </h2>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3 flex items-start gap-3">
            <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#c9d1d9] tabular-nums">
                {format(parseISO(tx.date), 'dd MMM yyyy')}
                <span className="mx-2 text-[#484f58]">·</span>
                <span style={{ color: tx.direction === 'out' ? '#e24b4a' : '#1d9e75' }} className="font-medium">
                  {tx.direction === 'out' ? '−' : '+'}{formatINRFull(Number(tx.amount))}
                </span>
              </p>
              <p className="text-[11px] text-[#6e7681] mt-1 truncate">
                {tx.ledger_accounts?.name}
                {tx.counterparty && ` · ${tx.counterparty}`}
                {tx.projects?.name && ` · ${tx.projects.name}`}
              </p>
            </div>
          </div>
          <p className="text-sm text-[#c9d1d9]">
            {isTransfer
              ? 'Both sides of this transfer (the outgoing and matching incoming row) will be removed.'
              : 'This entry will be permanently removed from the ledger.'}{' '}
            This cannot be undone.
          </p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            disabled={isPending}
            onClick={() => onConfirm(tx)}
            className="flex-1 py-2 rounded-lg bg-[#da3633] hover:bg-[#e24b4a] text-white text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Deleting…' : isTransfer ? 'Delete transfer' : 'Delete transaction'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Description helper ────────────────────────────────────────────────────

function describeTransaction(tx: TransactionWithRelations): string {
  if (tx.type === 'transfer') {
    return tx.direction === 'out'
      ? `Transfer out${tx.notes ? ` — ${tx.notes}` : ''}`
      : `Transfer in${tx.notes ? ` — ${tx.notes}` : ''}`
  }
  if (tx.type === 'collection') {
    const proj = tx.projects?.name
    return proj ? `Collection from ${proj}` : 'Collection'
  }
  if (tx.type === 'opening_balance') return 'Opening balance'
  if (tx.type === 'expense') {
    if (tx.people?.name) return `Salary — ${tx.people.name}`
    if (tx.counterparty) return tx.counterparty
    if (tx.projects?.name) return `Project expense — ${tx.projects.name}`
    return tx.expense_category ? EXPENSE_CATEGORY_LABEL[tx.expense_category] : 'Expense'
  }
  // other_income
  return tx.counterparty || 'Other income'
}

// ── Account card ──────────────────────────────────────────────────────────

interface AccountCardProps {
  name: string
  type?: 'cash' | 'bank'
  balance: number
  isAll?: boolean
  isActive: boolean
  onClick: () => void
}

function AccountCard({ name, type, balance, isAll, isActive, onClick }: AccountCardProps) {
  const Icon = isAll ? Wallet : type === 'cash' ? Wallet : Banknote
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border p-4 text-left transition-all',
        isActive
          ? 'border-[#58a6ff]/50 bg-[#58a6ff]/[0.06]'
          : 'border-[#30363d] bg-[#161b22] hover:border-[#484f58]',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            className={cn('h-3.5 w-3.5 flex-shrink-0', isActive ? 'text-[#58a6ff]' : 'text-[#6e7681]')}
          />
          <p className="text-xs font-medium text-[#c9d1d9] truncate">{name}</p>
        </div>
        {type && (
          <span className="text-[9px] font-medium uppercase tracking-wide text-[#6e7681]">
            {type}
          </span>
        )}
      </div>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums',
          balance < 0 ? 'text-[#e24b4a]' : 'text-[#e6edf3]',
        )}
      >
        {formatINRFull(balance)}
      </p>
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ onAddAccount }: { onAddAccount: () => void }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-12 text-center">
      <div className="h-12 w-12 rounded-full bg-[#58a6ff]/10 border border-[#58a6ff]/30 flex items-center justify-center mx-auto mb-4">
        <Wallet className="h-5 w-5 text-[#58a6ff]" />
      </div>
      <h2 className="text-base font-medium text-[#e6edf3]">Set up your first ledger account</h2>
      <p className="text-sm text-[#8b949e] mt-1.5 max-w-md mx-auto">
        Add your bank accounts and cash on hand. Then record an opening balance,
        and start logging expenses and project collections.
      </p>
      <button
        onClick={onAddAccount}
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add account
      </button>
    </div>
  )
}
