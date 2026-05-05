'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createLedgerAccount } from '@/lib/queries/ledger'
import { cn } from '@/lib/utils'
import type { LedgerAccountType } from '@/lib/supabase/types'
import { Banknote, Wallet, X, AlertCircle } from 'lucide-react'

interface AddAccountDialogProps {
  open: boolean
  onClose: () => void
}

export function AddAccountDialog(props: AddAccountDialogProps) {
  // Mount only when open so state resets cleanly on each open.
  if (!props.open) return null
  return <AddAccountDialogInner {...props} />
}

function AddAccountDialogInner({ onClose }: AddAccountDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<LedgerAccountType>('bank')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      await createLedgerAccount({ name: name.trim(), type, notes: notes.trim() || null })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger_accounts'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const valid = name.trim().length > 0
  const inputCls = 'w-full text-sm bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#484f58]'
  const labelCls = 'text-xs text-[#8b949e] block mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#e6edf3]">New ledger account</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className={labelCls}>Type</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'bank' as const, icon: Banknote, label: 'Bank account' },
                { value: 'cash' as const, icon: Wallet,   label: 'Cash' },
              ]).map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm transition-all',
                    type === t.value
                      ? 'border-[#58a6ff]/50 bg-[#58a6ff]/10 text-[#58a6ff]'
                      : 'border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#484f58]'
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Name *</label>
            <input
              className={inputCls}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'bank' ? 'e.g. HDFC Current — 1234' : 'e.g. Petty Cash'}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea
              className={cn(inputCls, 'resize-none')}
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Account number, branch, etc."
            />
          </div>

          {error && (
            <div className="rounded-md border border-[#e24b4a]/40 bg-[#e24b4a]/10 px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-[#e24b4a] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#e24b4a]">{error}</p>
            </div>
          )}

          <p className="text-[11px] text-[#6e7681]">
            Tip: After creating, add an &ldquo;Opening balance&rdquo; transaction with your account&rsquo;s starting amount and date.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-[#30363d] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-3 py-1.5 rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-xs transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => { setError(null); mutation.mutate() }}
            disabled={!valid || mutation.isPending}
            className="px-4 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            {mutation.isPending ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}
