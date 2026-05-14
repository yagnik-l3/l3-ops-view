'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getMyProfile } from '@/lib/queries/profile'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, UserPlus, X, Check, Ban, ShieldCheck, Trash2 } from 'lucide-react'
import type { Person, PersonType } from '@/lib/supabase/types'
import type { ManagedUser } from '@/app/api/users/route'
import { cn } from '@/lib/utils'

const AVATAR_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#EF9F27', '#888780',
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
]

const PERSON_TYPES: PersonType[] = ['developer', 'designer', 'founder', 'other']

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <h2 className="text-sm font-semibold text-[#e6edf3]">{title}</h2>
          <button onClick={onClose} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[#8b949e] block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] transition-colors'

export default function SettingsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [showAddPerson, setShowAddPerson] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [personForm, setPersonForm] = useState({
    name: '', role: '', type: 'developer' as PersonType,
    avatar_initials: '', avatar_color: AVATAR_COLORS[0],
    default_hourly_rate: '',
    monthly_salary: '',
  })
  const [inviteForm, setInviteForm] = useState<{
    email: string; full_name: string; role: 'founder' | 'employee'; person_id: string; password: string
  }>({ email: '', full_name: '', role: 'founder', person_id: '', password: '' })
  const [inviteSuccess, setInviteSuccess] = useState<{ email: string; password: string } | null>(null)
  const [showInvitePassword, setShowInvitePassword] = useState(false)
  const [editMemberId, setEditMemberId] = useState<string | null>(null)
  const [editMemberForm, setEditMemberForm] = useState<{
    full_name: string; role: 'founder' | 'employee'; person_id: string
  }>({ full_name: '', role: 'founder', person_id: '' })
  const [confirmDeleteMember, setConfirmDeleteMember] = useState(false)

  const { data: people, isLoading } = useQuery({
    queryKey: ['people_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('people').select('*').order('name')
      if (error) throw error
      return data as Person[]
    },
  })

  const { data: teamProfiles } = useQuery({
    queryKey: ['team_profiles'],
    queryFn: async () => {
      const res = await fetch('/api/users')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to load members (${res.status})`)
      }
      const { users } = (await res.json()) as { users: ManagedUser[] }
      return users
    },
  })

  const { data: myProfile } = useQuery({
    queryKey: ['my_profile'],
    queryFn: getMyProfile,
  })
  const myUserId = myProfile?.id ?? null

  const createPersonMutation = useMutation({
    mutationFn: async () => {
      const initials = personForm.avatar_initials ||
        personForm.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
      const { data, error } = await supabase.from('people').insert({
        name: personForm.name,
        role: personForm.role,
        type: personForm.type,
        avatar_initials: initials,
        avatar_color: personForm.avatar_color,
        default_hourly_rate: personForm.default_hourly_rate ? parseFloat(personForm.default_hourly_rate) : null,
        monthly_salary: personForm.monthly_salary ? parseFloat(personForm.monthly_salary) : null,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['people_all'] })
      setShowAddPerson(false)
      setPersonForm({ name: '', role: '', type: 'developer', avatar_initials: '', avatar_color: AVATAR_COLORS[0], default_hourly_rate: '', monthly_salary: '' })
    },
  })

  const updatePersonMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('people').update({
        name: personForm.name,
        role: personForm.role,
        type: personForm.type,
        avatar_initials: personForm.avatar_initials,
        avatar_color: personForm.avatar_color,
        default_hourly_rate: personForm.default_hourly_rate ? parseFloat(personForm.default_hourly_rate) : null,
        monthly_salary: personForm.monthly_salary ? parseFloat(personForm.monthly_salary) : null,
      }).eq('id', editPerson!.id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['people_all'] })
      setEditPerson(null)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('people').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['people_all'] })
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email,
          full_name: inviteForm.role === 'founder' ? inviteForm.full_name : null,
          role: inviteForm.role,
          person_id: inviteForm.role === 'employee' ? inviteForm.person_id : null,
          password: inviteForm.password,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Create failed (${res.status})`)
      }
      return { email: inviteForm.email, password: inviteForm.password }
    },
    onSuccess: (creds) => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      setInviteSuccess(creds)
    },
  })

  const editMemberMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${editMemberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: editMemberForm.role === 'founder' ? editMemberForm.full_name : null,
          role: editMemberForm.role,
          person_id: editMemberForm.role === 'employee' ? editMemberForm.person_id : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Save failed (${res.status})`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      setEditMemberId(null)
    },
  })

  const banMemberMutation = useMutation({
    mutationFn: async ({ id, banned }: { id: string; banned: boolean }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Action failed (${res.status})`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
    },
  })

  const deleteMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Delete failed (${res.status})`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      setEditMemberId(null)
      setConfirmDeleteMember(false)
    },
  })

  function closeInviteModal() {
    setShowInvite(false)
    setInviteSuccess(null)
    setShowInvitePassword(false)
    setInviteForm({ email: '', full_name: '', role: 'founder', person_id: '', password: '' })
  }

  // People available for employee invite: active + not already linked.
  const linkedPersonIds = new Set((teamProfiles ?? []).map(p => p.person_id).filter(Boolean) as string[])
  const invitablePeople = (people ?? []).filter(p => p.is_active && !linkedPersonIds.has(p.id))

  const editMember = (teamProfiles ?? []).find(m => m.id === editMemberId) ?? null
  // People selectable when re-linking an employee: active + unlinked, plus the
  // one this member is already linked to.
  const editablePeople = (people ?? []).filter(
    p => p.is_active && (!linkedPersonIds.has(p.id) || p.id === editMember?.person_id)
  )

  function openEditMember(m: ManagedUser) {
    setEditMemberForm({
      full_name: m.full_name ?? '',
      role: m.role === 'employee' ? 'employee' : 'founder',
      person_id: m.person_id ?? '',
    })
    setConfirmDeleteMember(false)
    editMemberMutation.reset()
    banMemberMutation.reset()
    deleteMemberMutation.reset()
    setEditMemberId(m.id)
  }

  function openEdit(person: Person) {
    setPersonForm({
      name: person.name,
      role: person.role,
      type: person.type,
      avatar_initials: person.avatar_initials ?? '',
      avatar_color: person.avatar_color ?? AVATAR_COLORS[0],
      default_hourly_rate: person.default_hourly_rate != null ? String(person.default_hourly_rate) : '',
      monthly_salary: person.monthly_salary != null ? String(person.monthly_salary) : '',
    })
    setEditPerson(person)
  }

  const showPersonModal = showAddPerson || !!editPerson

  return (
    <div className="p-6 space-y-8 min-h-screen bg-[#0d1117]">
      <div>
        <h1 className="text-xl font-semibold text-[#e6edf3]">Settings</h1>
        <p className="text-sm text-[#8b949e] mt-0.5">Manage your team and access</p>
      </div>

      {/* Team members */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium text-[#c9d1d9]">Team members</h2>
          <button
            onClick={() => setShowAddPerson(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-xs transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add person
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full bg-[#21262d]" />)}
          </div>
        ) : (
          <div className="space-y-1">
            {(people ?? []).map(person => (
              <div
                key={person.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#21262d]/60 transition-colors',
                  !person.is_active && 'opacity-40'
                )}
              >
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                  style={{ backgroundColor: person.avatar_color ?? '#1d9e75' }}
                >
                  {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#e6edf3]">{person.name}</p>
                  <p className="text-xs text-[#6e7681] capitalize">
                    {person.role} · {person.type}
                    {person.default_hourly_rate != null && (
                      <span className="ml-1 text-[#484f58]">· ₹{person.default_hourly_rate}/h</span>
                    )}
                    {person.monthly_salary != null && (
                      <span className="ml-1 text-[#484f58]">· ₹{(person.monthly_salary / 1000).toFixed(0)}K/mo</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: person.id, is_active: !person.is_active })}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-md transition-colors',
                      person.is_active
                        ? 'bg-[#1d9e75]/10 text-[#1d9e75] hover:bg-[#1d9e75]/20'
                        : 'bg-[#21262d] text-[#6e7681] hover:bg-[#2d333b]'
                    )}
                  >
                    {person.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => openEdit(person)}
                    className="p-1.5 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#21262d] rounded transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {(people ?? []).length === 0 && (
              <p className="text-sm text-[#6e7681] py-4 text-center">No team members yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Members with access */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium text-[#c9d1d9]">Members with access</h2>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-xs transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" /> Create member
          </button>
        </div>
        <div className="space-y-1">
          {(teamProfiles ?? []).map(m => {
            const linkedPerson = m.person_id ? (people ?? []).find(pp => pp.id === m.person_id) : null
            const isFounder = m.role === 'founder'
            const isSelf = m.id === myUserId
            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#21262d]/60 transition-colors',
                  m.banned && 'opacity-50'
                )}
              >
                <div className="h-8 w-8 rounded-full bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#8b949e] text-xs font-medium shrink-0">
                  {m.full_name?.slice(0, 2).toUpperCase() ?? '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#e6edf3] truncate">
                    {m.full_name ?? 'Unnamed'}
                    {isSelf && <span className="ml-1.5 text-[10px] text-[#6e7681]">(you)</span>}
                  </p>
                  <p className="text-xs text-[#6e7681] truncate">
                    {m.email ?? 'no email'}
                    {linkedPerson && <> · &rarr; {linkedPerson.name}</>}
                  </p>
                </div>
                {m.banned && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/20">
                    Banned
                  </span>
                )}
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full border',
                  isFounder
                    ? 'bg-[#378add]/10 text-[#378add] border-[#378add]/20'
                    : 'bg-[#1d9e75]/10 text-[#1d9e75] border-[#1d9e75]/20'
                )}>
                  {isFounder ? 'Founder' : 'Employee'}
                </span>
                {!isSelf && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => banMemberMutation.mutate({ id: m.id, banned: !m.banned })}
                      disabled={banMemberMutation.isPending}
                      title={m.banned ? 'Unban user' : 'Ban user'}
                      className="p-1.5 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#21262d] rounded transition-colors disabled:opacity-50"
                    >
                      {m.banned
                        ? <ShieldCheck className="h-3.5 w-3.5" />
                        : <Ban className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => openEditMember(m)}
                      title="Edit user"
                      className="p-1.5 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#21262d] rounded transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {(teamProfiles ?? []).length === 0 && (
            <p className="text-sm text-[#6e7681] py-4 text-center">No members found.</p>
          )}
        </div>
      </div>

      {/* Add / Edit person modal */}
      {showPersonModal && (
        <Modal
          title={editPerson ? 'Edit member' : 'Add team member'}
          onClose={() => { setShowAddPerson(false); setEditPerson(null) }}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name *">
                <input className={inputCls} value={personForm.name}
                  onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Rahul Sharma" autoFocus />
              </Field>
              <Field label="Role *">
                <input className={inputCls} value={personForm.role}
                  onChange={e => setPersonForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="Frontend Dev" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select className={inputCls} value={personForm.type}
                  onChange={e => setPersonForm(f => ({ ...f, type: e.target.value as PersonType }))}>
                  {PERSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Initials (2 chars)">
                <input maxLength={2} className={cn(inputCls, 'uppercase')}
                  value={personForm.avatar_initials}
                  onChange={e => setPersonForm(f => ({ ...f, avatar_initials: e.target.value.toUpperCase() }))}
                  placeholder="RS" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Default hourly rate (₹/h)">
                <input
                  type="number"
                  className={inputCls}
                  value={personForm.default_hourly_rate}
                  onChange={e => setPersonForm(f => ({ ...f, default_hourly_rate: e.target.value }))}
                  placeholder="e.g. 500"
                />
              </Field>
              <Field label="Monthly salary (₹)">
                <input
                  type="number"
                  className={inputCls}
                  value={personForm.monthly_salary}
                  onChange={e => setPersonForm(f => ({ ...f, monthly_salary: e.target.value }))}
                  placeholder="e.g. 60000"
                />
              </Field>
            </div>

            {/* Avatar colour */}
            <Field label="Avatar colour">
              <div className="flex gap-2 flex-wrap mt-1">
                {AVATAR_COLORS.map(color => (
                  <button
                    key={color}
                    className={cn(
                      'h-7 w-7 rounded-full transition-all',
                      personForm.avatar_color === color && 'ring-2 ring-offset-2 ring-[#58a6ff] ring-offset-[#161b22] scale-110'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setPersonForm(f => ({ ...f, avatar_color: color }))}
                  />
                ))}
              </div>
            </Field>

            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                style={{ backgroundColor: personForm.avatar_color }}>
                {personForm.avatar_initials || personForm.name.slice(0, 2).toUpperCase() || 'AB'}
              </div>
              <div>
                <p className="text-sm font-medium text-[#e6edf3]">{personForm.name || 'Name preview'}</p>
                <p className="text-xs text-[#6e7681] capitalize">{personForm.role || 'Role preview'} · {personForm.type}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                onClick={() => editPerson ? updatePersonMutation.mutate() : createPersonMutation.mutate()}
                disabled={!personForm.name || !personForm.role || createPersonMutation.isPending || updatePersonMutation.isPending}
              >
                {createPersonMutation.isPending || updatePersonMutation.isPending
                  ? 'Saving…'
                  : editPerson ? 'Save changes' : 'Add member'}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
                onClick={() => { setShowAddPerson(false); setEditPerson(null) }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create member modal */}
      {showInvite && (
        <Modal title="Create member" onClose={closeInviteModal}>
          {inviteSuccess ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#1d9e75]">
                <Check className="h-5 w-5" />
                <p className="text-sm font-medium">User created.</p>
              </div>
              <p className="text-xs text-[#8b949e]">Share these credentials with them — they can sign in immediately.</p>
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#6e7681]">email</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(inviteSuccess.email)}
                    className="text-[#e6edf3] hover:text-[#58a6ff] transition-colors text-right truncate"
                    title="Click to copy"
                  >
                    {inviteSuccess.email}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#6e7681]">password</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(inviteSuccess.password)}
                    className="text-[#e6edf3] hover:text-[#58a6ff] transition-colors text-right"
                    title="Click to copy"
                  >
                    {inviteSuccess.password}
                  </button>
                </div>
              </div>
              <button
                onClick={closeInviteModal}
                className="w-full py-2 rounded-lg bg-[#21262d] hover:bg-[#2d333b] text-[#e6edf3] text-sm transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Role *">
                <div className="grid grid-cols-2 gap-2">
                  {(['founder', 'employee'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInviteForm(f => ({ ...f, role: r, person_id: '' }))}
                      className={cn(
                        'text-sm py-2 rounded-lg border transition-colors capitalize',
                        inviteForm.role === r
                          ? 'border-[#58a6ff] bg-[#58a6ff]/10 text-[#e6edf3]'
                          : 'border-[#30363d] text-[#8b949e] hover:text-[#e6edf3]'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </Field>

              {inviteForm.role === 'employee' ? (
                <Field label="Link to person *">
                  <select
                    className={inputCls}
                    value={inviteForm.person_id}
                    onChange={e => setInviteForm(f => ({ ...f, person_id: e.target.value }))}
                  >
                    <option value="">Select a person…</option>
                    {invitablePeople.map(p => (
                      <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
                    ))}
                  </select>
                  {invitablePeople.length === 0 && (
                    <p className="text-[11px] text-[#6e7681] mt-1.5">
                      No unlinked active people. Add one above first.
                    </p>
                  )}
                  {inviteForm.person_id && (
                    <p className="text-[11px] text-[#8b949e] mt-1.5">
                      Display name will use {(invitablePeople.find(p => p.id === inviteForm.person_id))?.name ?? '—'}.
                    </p>
                  )}
                </Field>
              ) : (
                <Field label="Full name">
                  <input className={inputCls} value={inviteForm.full_name}
                    onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Priya Mehta" />
                </Field>
              )}

              <Field label="Email *">
                <input type="email" className={inputCls} value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="priya@l3labs.com" />
              </Field>
              <Field label="Initial password *">
                <div className="relative">
                  <input
                    type={showInvitePassword ? 'text' : 'password'}
                    className={cn(inputCls, 'pr-16')}
                    value={inviteForm.password}
                    onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 chars"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInvitePassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8b949e] hover:text-[#e6edf3] px-1.5 py-0.5"
                  >
                    {showInvitePassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-[11px] text-[#6e7681] mt-1.5">
                  Share this with them — they can change it later.
                </p>
              </Field>

              {inviteMutation.isError && (
                <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                  {(inviteMutation.error as Error)?.message ?? 'Create failed.'}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                  onClick={() => inviteMutation.mutate()}
                  disabled={
                    !inviteForm.email ||
                    inviteForm.password.length < 8 ||
                    inviteMutation.isPending ||
                    (inviteForm.role === 'employee' && !inviteForm.person_id)
                  }
                >
                  {inviteMutation.isPending ? 'Creating…' : 'Create user'}
                </button>
                <button
                  className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
                  onClick={closeInviteModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Edit member modal */}
      {editMember && (
        <Modal
          title="Edit member"
          onClose={() => { setEditMemberId(null); setConfirmDeleteMember(false) }}
        >
          <div className="space-y-4">
            <Field label="Role *">
              <div className="grid grid-cols-2 gap-2">
                {(['founder', 'employee'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setEditMemberForm(f => ({ ...f, role: r }))}
                    className={cn(
                      'text-sm py-2 rounded-lg border transition-colors capitalize',
                      editMemberForm.role === r
                        ? 'border-[#58a6ff] bg-[#58a6ff]/10 text-[#e6edf3]'
                        : 'border-[#30363d] text-[#8b949e] hover:text-[#e6edf3]'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Field>

            {editMemberForm.role === 'employee' ? (
              <Field label="Link to person *">
                <select
                  className={inputCls}
                  value={editMemberForm.person_id}
                  onChange={e => setEditMemberForm(f => ({ ...f, person_id: e.target.value }))}
                >
                  <option value="">Select a person…</option>
                  {editablePeople.map(p => (
                    <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
                  ))}
                </select>
                {editablePeople.length === 0 && (
                  <p className="text-[11px] text-[#6e7681] mt-1.5">
                    No unlinked active people. Add one above first.
                  </p>
                )}
                {editMemberForm.person_id && (
                  <p className="text-[11px] text-[#8b949e] mt-1.5">
                    Display name will use {editablePeople.find(p => p.id === editMemberForm.person_id)?.name ?? '—'}.
                  </p>
                )}
              </Field>
            ) : (
              <Field label="Full name">
                <input
                  className={inputCls}
                  value={editMemberForm.full_name}
                  onChange={e => setEditMemberForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Priya Mehta"
                />
              </Field>
            )}

            {editMemberMutation.isError && (
              <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                {(editMemberMutation.error as Error)?.message ?? 'Save failed.'}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                onClick={() => editMemberMutation.mutate()}
                disabled={
                  editMemberMutation.isPending ||
                  (editMemberForm.role === 'employee' && !editMemberForm.person_id)
                }
              >
                {editMemberMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
                onClick={() => { setEditMemberId(null); setConfirmDeleteMember(false) }}
              >
                Cancel
              </button>
            </div>

            {/* Danger zone */}
            <div className="border-t border-[#30363d] pt-4 space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-[#6e7681]">Danger zone</p>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[#e6edf3]">{editMember.banned ? 'User is banned' : 'Ban user'}</p>
                  <p className="text-[11px] text-[#6e7681]">
                    {editMember.banned
                      ? 'They cannot sign in. Unban to restore access.'
                      : 'Blocks sign-in but keeps the account and data.'}
                  </p>
                </div>
                <button
                  onClick={() => banMemberMutation.mutate({ id: editMember.id, banned: !editMember.banned })}
                  disabled={banMemberMutation.isPending}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 shrink-0',
                    editMember.banned
                      ? 'border-[#1d9e75]/30 text-[#1d9e75] hover:bg-[#1d9e75]/10'
                      : 'border-[#e2a23b]/30 text-[#e2a23b] hover:bg-[#e2a23b]/10'
                  )}
                >
                  {banMemberMutation.isPending ? '…' : editMember.banned ? 'Unban' : 'Ban'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[#e6edf3]">Delete user</p>
                  <p className="text-[11px] text-[#6e7681]">
                    Permanently removes their login and access. Cannot be undone.
                  </p>
                </div>
                {confirmDeleteMember ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => deleteMemberMutation.mutate(editMember.id)}
                      disabled={deleteMemberMutation.isPending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#e24b4a] hover:bg-[#f0504f] text-white transition-colors disabled:opacity-50"
                    >
                      {deleteMemberMutation.isPending ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteMember(false)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteMember(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#e24b4a]/30 text-[#e24b4a] hover:bg-[#e24b4a]/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>

              {(banMemberMutation.isError || deleteMemberMutation.isError) && (
                <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                  {((banMemberMutation.error || deleteMemberMutation.error) as Error)?.message ?? 'Action failed.'}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
