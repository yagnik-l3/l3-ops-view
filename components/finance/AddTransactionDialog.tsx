'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_CATEGORY_ORDER,
  insertTransaction,
  insertTransferPair,
  updateTransaction,
} from '@/lib/queries/ledger'
import { formatINR } from '@/lib/utils/currency'
import type {
  ExpenseCategory,
  LedgerAccount,
  Person,
  Project,
  TransactionType,
  TransactionWithRelations,
} from '@/lib/supabase/types'
import { X, AlertCircle, Wallet, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, PlusCircle, Sparkles, Lock } from 'lucide-react'

type Mode = 'expense' | 'collection' | 'transfer' | 'opening_balance' | 'other_income'

interface AddTransactionDialogProps {
  open: boolean
  onClose: () => void
  /** Pre-fill project (used from project detail page or collections page) */
  preselectedProjectId?: string
  /** Pre-select transaction type when the dialog opens */
  defaultMode?: Mode
  /** When provided, dialog switches to edit mode for this transaction */
  editTransaction?: TransactionWithRelations | null
}

const MODE_META: Record<Mode, { icon: typeof Wallet; color: string; label: string; hint: string }> = {
  expense:         { icon: ArrowUpCircle,   color: '#e24b4a', label: 'Expense',         hint: 'Money going out' },
  collection:      { icon: ArrowDownCircle, color: '#1d9e75', label: 'Collection',      hint: 'Client payment for a project' },
  transfer:        { icon: ArrowLeftRight,  color: '#378add', label: 'Transfer',        hint: 'Move money between accounts' },
  other_income:    { icon: PlusCircle,      color: '#1d9e75', label: 'Other income',    hint: 'Non-project income (refunds, interest…)' },
  opening_balance: { icon: Sparkles,        color: '#8b5cf6', label: 'Opening balance', hint: 'Starting balance for an account (one-time)' },
}

const MODE_ORDER: Mode[] = ['expense', 'collection', 'transfer', 'other_income', 'opening_balance']

export function AddTransactionDialog(props: AddTransactionDialogProps) {
  // Mount only when open so each open starts with fresh state.
  if (!props.open) return null
  return <AddTransactionDialogInner {...props} />
}

function AddTransactionDialogInner({
  onClose,
  preselectedProjectId,
  defaultMode = 'expense',
  editTransaction,
}: AddTransactionDialogProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const isEdit = !!editTransaction

  // ── Initial values (derived once from editTransaction or props) ──────────
  const initial = useMemo(() => {
    if (editTransaction) {
      return {
        mode: editTransaction.type as Mode,
        accountId: editTransaction.account_id,
        toAccountId: '',
        date: editTransaction.date,
        amount: String(editTransaction.amount),
        category: (editTransaction.expense_category ?? 'office') as ExpenseCategory,
        projectId: editTransaction.project_id ?? '',
        personId: editTransaction.person_id ?? '',
        counterparty: editTransaction.counterparty ?? '',
        reference: editTransaction.reference ?? '',
        notes: editTransaction.notes ?? '',
      }
    }
    return {
      mode: defaultMode,
      accountId: '',
      toAccountId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: '',
      category: 'office' as ExpenseCategory,
      projectId: preselectedProjectId ?? '',
      personId: '',
      counterparty: '',
      reference: '',
      notes: '',
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [mode, setMode] = useState<Mode>(initial.mode)
  const [accountId, setAccountId] = useState(initial.accountId)
  const [toAccountId, setToAccountId] = useState(initial.toAccountId)
  const [date, setDate] = useState(initial.date)
  const [amount, setAmount] = useState(initial.amount)
  const [category, setCategory] = useState<ExpenseCategory>(initial.category)
  const [projectId, setProjectId] = useState(initial.projectId)
  const [personId, setPersonId] = useState(initial.personId)
  const [counterparty, setCounterparty] = useState(initial.counterparty)
  const [reference, setReference] = useState(initial.reference)
  const [notes, setNotes] = useState(initial.notes)
  const [error, setError] = useState<string | null>(null)

  const { data: accounts } = useQuery({
    queryKey: ['ledger_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ledger_accounts').select('*')
        .eq('is_active', true).order('created_at', { ascending: true })
      if (error) throw error
      return data as LedgerAccount[]
    },
  })

  const { data: projects } = useQuery({
    queryKey: ['projects_for_ledger'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('name')
      if (error) throw error
      return data as Project[]
    },
    enabled: mode === 'collection' || mode === 'expense',
  })

  const { data: people } = useQuery({
    queryKey: ['people_for_ledger'],
    queryFn: async () => {
      const { data, error } = await supabase.from('people').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data as Person[]
    },
    enabled: mode === 'expense' && category === 'salary',
  })

  // For an in-flight transfer being edited, fetch the pair to show "to" account.
  const { data: transferPair } = useQuery({
    queryKey: ['transfer_pair', editTransaction?.transfer_pair_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, ledger_accounts(*)')
        .eq('transfer_pair_id', editTransaction!.transfer_pair_id!)
      if (error) throw error
      return data as TransactionWithRelations[]
    },
    enabled: isEdit && mode === 'transfer' && !!editTransaction?.transfer_pair_id,
  })

  // For a transfer, identify the "out" and "in" sides for read-only display.
  const transferFrom = useMemo(
    () => transferPair?.find(t => t.direction === 'out')?.ledger_accounts ?? null,
    [transferPair],
  )
  const transferTo = useMemo(
    () => transferPair?.find(t => t.direction === 'in')?.ledger_accounts ?? null,
    [transferPair],
  )

  // Default to the first account when none is explicitly chosen.
  const effectiveAccountId = accountId || accounts?.[0]?.id || ''

  function onPersonSelect(id: string) {
    setPersonId(id)
    const p = (people ?? []).find(x => x.id === id)
    if (p?.monthly_salary) setAmount(String(p.monthly_salary))
  }

  // ── Validation ───────────────────────────────────────────────────────────
  const validation = useMemo<{ valid: boolean; reason?: string }>(() => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return { valid: false, reason: 'Enter a positive amount' }
    if (!date) return { valid: false, reason: 'Pick a date' }
    if (!effectiveAccountId) return { valid: false, reason: 'Pick an account' }
    if (mode === 'collection' && !projectId) return { valid: false, reason: 'Pick a project for the collection' }
    if (!isEdit && mode === 'transfer') {
      if (!toAccountId) return { valid: false, reason: 'Pick a destination account' }
      if (toAccountId === effectiveAccountId) return { valid: false, reason: 'Source and destination must differ' }
    }
    return { valid: true }
  }, [amount, date, effectiveAccountId, toAccountId, projectId, mode, isEdit])

  // ── Submit (insert or update) ────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount)

      if (isEdit && editTransaction) {
        await updateTransaction(editTransaction.id, editTransaction.transfer_pair_id, {
          date,
          amount: amt,
          // For transfers the helper only mirrors date/amount/notes/reference;
          // category/project/person/counterparty/account aren't sent so the
          // pair stays intact.
          account_id: mode !== 'transfer' ? effectiveAccountId : undefined,
          expense_category: mode === 'expense' ? category : null,
          project_id:
            mode === 'collection' ? projectId :
            mode === 'expense' && projectId ? projectId :
            null,
          person_id: mode === 'expense' && category === 'salary' && personId ? personId : null,
          counterparty: counterparty || null,
          reference: reference || null,
          notes: notes || null,
        })
        return
      }

      if (mode === 'transfer') {
        await insertTransferPair(
          effectiveAccountId, toAccountId, amt, date, notes || null, reference || null,
        )
        return
      }

      const direction = mode === 'expense' ? 'out' : 'in'
      await insertTransaction({
        account_id: effectiveAccountId,
        date,
        direction,
        amount: amt,
        type: mode as TransactionType,
        expense_category: mode === 'expense' ? category : null,
        project_id:
          mode === 'collection' ? projectId :
          mode === 'expense' && projectId ? projectId : null,
        person_id: mode === 'expense' && category === 'salary' && personId ? personId : null,
        counterparty: counterparty || null,
        reference: reference || null,
        notes: notes || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['ledger_accounts'] })
      queryClient.invalidateQueries({ queryKey: ['project_collections'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const meta = MODE_META[mode]

  // ── styles ───────────────────────────────────────────────────────────────
  const inputCls = 'w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#484f58]'
  const lockedCls = 'w-full text-sm bg-[#0d1117]/50 border border-[#30363d] rounded-md px-3 py-2 text-[#8b949e] flex items-center justify-between'
  const labelCls = 'text-xs text-[#8b949e] block mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg shadow-2xl my-8">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="h-7 w-7 rounded-md flex items-center justify-center"
              style={{ backgroundColor: meta.color + '22', color: meta.color }}
            >
              <meta.icon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#e6edf3]">
                {isEdit ? 'Edit transaction' : 'New transaction'}
              </h2>
              <p className="text-[11px] text-[#6e7681]">{meta.hint}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Type selector — hidden in edit mode (type is immutable) */}
        {!isEdit && (
          <div className="px-5 pt-5">
            <label className={labelCls}>Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {MODE_ORDER.map(m => {
                const M = MODE_META[m]
                const active = mode === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 px-1 rounded-md border text-[10px] font-medium transition-all',
                      active
                        ? 'border-[#30363d] bg-[#0d1117] text-[#e6edf3]'
                        : 'border-transparent text-[#6e7681] hover:text-[#c9d1d9] hover:bg-[#21262d]/60',
                    )}
                    style={active ? { borderColor: M.color + '66', boxShadow: `inset 0 0 0 1px ${M.color}33` } : undefined}
                  >
                    <M.icon className="h-3.5 w-3.5" style={active ? { color: M.color } : undefined} />
                    <span className="leading-tight text-center">{M.label.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Form body */}
        <div className="px-5 py-5 space-y-4">
          {isEdit && (
            <div className="rounded-md border border-[#30363d]/60 bg-[#0d1117] px-3 py-2 flex items-start gap-2">
              <Lock className="h-3 w-3 text-[#6e7681] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#8b949e]">
                Transaction type is locked. To change it, delete this entry and create a new one.
                {mode === 'transfer' && ' Source and destination accounts are also locked for transfers.'}
              </p>
            </div>
          )}

          {/* Amount + Date — always shown */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Amount (₹) *</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className={cn(inputCls, 'tabular-nums text-base font-medium')}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
              {amount && Number(amount) > 0 && (
                <p className="text-[11px] text-[#6e7681] mt-1 tabular-nums">
                  {formatINR(Number(amount))}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Account selector(s) */}
          {mode === 'transfer' ? (
            isEdit ? (
              // Locked transfer accounts — show as read-only chips
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>From account</label>
                  <div className={lockedCls}>
                    <span className="truncate">{transferFrom?.name ?? '—'}</span>
                    <Lock className="h-3 w-3 text-[#6e7681] flex-shrink-0 ml-2" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>To account</label>
                  <div className={lockedCls}>
                    <span className="truncate">{transferTo?.name ?? '—'}</span>
                    <Lock className="h-3 w-3 text-[#6e7681] flex-shrink-0 ml-2" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>From account *</label>
                  <select className={inputCls} value={effectiveAccountId} onChange={e => setAccountId(e.target.value)}>
                    <option value="">Select…</option>
                    {(accounts ?? []).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>To account *</label>
                  <select className={inputCls} value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
                    <option value="">Select…</option>
                    {(accounts ?? []).filter(a => a.id !== effectiveAccountId).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                    ))}
                  </select>
                </div>
              </div>
            )
          ) : (
            <div>
              <label className={labelCls}>{mode === 'expense' ? 'Paid from *' : 'Received in *'}</label>
              <select className={inputCls} value={effectiveAccountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Select account…</option>
                {(accounts ?? []).map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                ))}
              </select>
              {(accounts ?? []).length === 0 && (
                <p className="text-[11px] text-[#ef9f27] mt-1.5 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> No accounts yet — create one from the Ledger page first.
                </p>
              )}
            </div>
          )}

          {/* Expense — category + optional person + optional project */}
          {mode === 'expense' && (
            <>
              <div>
                <label className={labelCls}>Category *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {EXPENSE_CATEGORY_ORDER.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'py-1.5 px-2 rounded-md border text-xs font-medium transition-all',
                        category === cat
                          ? 'border-[#58a6ff]/50 bg-[#58a6ff]/10 text-[#58a6ff]'
                          : 'border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#484f58]'
                      )}
                    >
                      {EXPENSE_CATEGORY_LABEL[cat]}
                    </button>
                  ))}
                </div>
              </div>

              {category === 'salary' && (
                <div>
                  <label className={labelCls}>Employee (optional — leave blank for bulk)</label>
                  <select className={inputCls} value={personId} onChange={e => onPersonSelect(e.target.value)}>
                    <option value="">— Bulk salary entry —</option>
                    {(people ?? []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.monthly_salary ? ` · ${formatINR(p.monthly_salary)}/mo` : ''}
                      </option>
                    ))}
                  </select>
                  {personId && !isEdit && (
                    <p className="text-[11px] text-[#6e7681] mt-1">
                      Amount auto-filled from employee&rsquo;s monthly salary. Edit it if you paid extra.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={labelCls}>Project (optional)</label>
                <select className={inputCls} value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">— Not project-specific —</option>
                  {(projects ?? []).map(p => (
                    <option key={p.id} value={p.id}>{p.name} · {p.client_name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Collection — required project */}
          {mode === 'collection' && (
            <div>
              <label className={labelCls}>Project *</label>
              <select
                className={inputCls}
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                disabled={!!preselectedProjectId && !isEdit}
              >
                <option value="">Select project…</option>
                {(projects ?? []).map(p => (
                  <option key={p.id} value={p.id}>{p.name} · {p.client_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Counterparty — for expense / other_income */}
          {(mode === 'expense' || mode === 'other_income') && (
            <div>
              <label className={labelCls}>
                {mode === 'expense' ? 'Paid to' : 'Received from'} (optional)
              </label>
              <input
                className={inputCls}
                value={counterparty}
                onChange={e => setCounterparty(e.target.value)}
                placeholder={mode === 'expense' ? 'e.g. AWS, landlord, agency' : 'e.g. interest, refund'}
              />
            </div>
          )}

          {/* Reference */}
          <div>
            <label className={labelCls}>Reference (optional)</label>
            <input
              className={inputCls}
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="UTR, cheque #, invoice #…"
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea
              className={cn(inputCls, 'resize-none')}
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any context…"
            />
          </div>

          {error && (
            <div className="rounded-md border border-[#e24b4a]/40 bg-[#e24b4a]/10 px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-[#e24b4a] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#e24b4a]">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#30363d] flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#6e7681]">
            {validation.valid ? '' : validation.reason}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitMutation.isPending}
              className="px-3 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-xs transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={() => { setError(null); submitMutation.mutate() }}
              disabled={!validation.valid || submitMutation.isPending}
              className="px-4 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitMutation.isPending
                ? 'Saving…'
                : isEdit ? 'Save changes' : 'Save transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
