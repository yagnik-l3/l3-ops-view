'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getMyProfile } from '@/lib/queries/profile'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, UserPlus, X, Check, Trash2, KeyRound, LockKeyhole } from 'lucide-react'
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
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] sticky top-0 bg-[#161b22] z-10">
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

function CredsBox({ creds }: { creds: { email: string; password: string } }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 space-y-2 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[#6e7681]">email</span>
        <button
          onClick={() => navigator.clipboard?.writeText(creds.email)}
          className="text-[#e6edf3] hover:text-[#58a6ff] transition-colors text-right truncate"
          title="Click to copy"
        >
          {creds.email}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[#6e7681]">password</span>
        <button
          onClick={() => navigator.clipboard?.writeText(creds.password)}
          className="text-[#e6edf3] hover:text-[#58a6ff] transition-colors text-right"
          title="Click to copy"
        >
          {creds.password}
        </button>
      </div>
    </div>
  )
}

const inputCls = 'w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] transition-colors'

const emptyPersonForm = {
  name: '', role: '', type: 'developer' as PersonType,
  avatar_initials: '', avatar_color: AVATAR_COLORS[0],
  default_hourly_rate: '', monthly_salary: '',
}

export default function SettingsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // ── Person add/edit ────────────────────────────────────────────────────
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [personForm, setPersonForm] = useState(emptyPersonForm)
  // Password reset inside person modal (only if linked login exists).
  const [personPassword, setPersonPassword] = useState('')
  const [showPersonPassword, setShowPersonPassword] = useState(false)
  // Grant-login sub-form inside person modal (only if no linked login).
  const [grantEmail, setGrantEmail] = useState('')
  const [grantPassword, setGrantPassword] = useState('')
  const [showGrantPassword, setShowGrantPassword] = useState(false)
  const [grantSuccess, setGrantSuccess] = useState<{ email: string; password: string } | null>(null)
  const [confirmRemoveLogin, setConfirmRemoveLogin] = useState(false)

  // ── Founder create ─────────────────────────────────────────────────────
  const [showCreateFounder, setShowCreateFounder] = useState(false)
  const [founderCreateForm, setFounderCreateForm] = useState({ email: '', full_name: '', password: '' })
  const [showFounderCreatePassword, setShowFounderCreatePassword] = useState(false)
  const [founderCreateSuccess, setFounderCreateSuccess] = useState<{ email: string; password: string } | null>(null)

  // ── Founder edit ───────────────────────────────────────────────────────
  const [editFounderId, setEditFounderId] = useState<string | null>(null)
  const [editFounderForm, setEditFounderForm] = useState({ full_name: '', password: '' })
  const [showEditFounderPassword, setShowEditFounderPassword] = useState(false)
  const [confirmDeleteFounder, setConfirmDeleteFounder] = useState(false)

  // ── Queries ────────────────────────────────────────────────────────────
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

  // ── Derived ────────────────────────────────────────────────────────────
  const loginByPersonId = new Map<string, ManagedUser>(
    (teamProfiles ?? [])
      .filter(p => p.person_id)
      .map(p => [p.person_id as string, p]),
  )
  const founders = (teamProfiles ?? []).filter(p => p.role === 'founder')
  const editPersonLogin = editPerson ? loginByPersonId.get(editPerson.id) ?? null : null
  const editFounder = founders.find(f => f.id === editFounderId) ?? null

  // ── Mutations: person ──────────────────────────────────────────────────
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
      setPersonForm(emptyPersonForm)
    },
  })

  // Updates the person row and, if a password was entered AND a login is
  // linked, resets the linked auth user's password in the same flow.
  const updatePersonMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('people').update({
        name: personForm.name,
        role: personForm.role,
        type: personForm.type,
        avatar_initials: personForm.avatar_initials,
        avatar_color: personForm.avatar_color,
        default_hourly_rate: personForm.default_hourly_rate ? parseFloat(personForm.default_hourly_rate) : null,
        monthly_salary: personForm.monthly_salary ? parseFloat(personForm.monthly_salary) : null,
      }).eq('id', editPerson!.id)
      if (error) throw error

      if (personPassword && editPersonLogin) {
        const res = await fetch(`/api/users/${editPersonLogin.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: personPassword }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Password update failed (${res.status})`)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['people_all'] })
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      closeEditPerson()
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

  // ── Mutations: login lifecycle ─────────────────────────────────────────
  const grantLoginMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: grantEmail,
          role: 'employee',
          person_id: editPerson?.id,
          password: grantPassword,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Create failed (${res.status})`)
      }
      return { email: grantEmail, password: grantPassword }
    },
    onSuccess: (creds) => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      setGrantSuccess(creds)
      setGrantEmail('')
      setGrantPassword('')
    },
  })

  const removeLoginMutation = useMutation({
    mutationFn: async (loginId: string) => {
      const res = await fetch(`/api/users/${loginId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Remove failed (${res.status})`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      setConfirmRemoveLogin(false)
    },
  })

  const banLoginMutation = useMutation({
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

  // ── Mutations: founders ────────────────────────────────────────────────
  const createFounderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: founderCreateForm.email,
          full_name: founderCreateForm.full_name,
          role: 'founder',
          password: founderCreateForm.password,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Create failed (${res.status})`)
      }
      return { email: founderCreateForm.email, password: founderCreateForm.password }
    },
    onSuccess: (creds) => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      setFounderCreateSuccess(creds)
    },
  })

  const editFounderMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        role: 'founder',
        full_name: editFounderForm.full_name,
        person_id: null,
      }
      if (editFounderForm.password) payload.password = editFounderForm.password
      const res = await fetch(`/api/users/${editFounderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Save failed (${res.status})`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      closeEditFounder()
    },
  })

  const deleteFounderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Delete failed (${res.status})`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_profiles'] })
      closeEditFounder()
    },
  })

  // ── Handlers ───────────────────────────────────────────────────────────
  function openAddPerson() {
    setPersonForm(emptyPersonForm)
    createPersonMutation.reset()
    setShowAddPerson(true)
  }

  function openEditPerson(person: Person) {
    setPersonForm({
      name: person.name,
      role: person.role,
      type: person.type,
      avatar_initials: person.avatar_initials ?? '',
      avatar_color: person.avatar_color ?? AVATAR_COLORS[0],
      default_hourly_rate: person.default_hourly_rate != null ? String(person.default_hourly_rate) : '',
      monthly_salary: person.monthly_salary != null ? String(person.monthly_salary) : '',
    })
    setPersonPassword('')
    setShowPersonPassword(false)
    setGrantEmail('')
    setGrantPassword('')
    setShowGrantPassword(false)
    setGrantSuccess(null)
    setConfirmRemoveLogin(false)
    updatePersonMutation.reset()
    grantLoginMutation.reset()
    removeLoginMutation.reset()
    banLoginMutation.reset()
    setEditPerson(person)
  }

  function closeEditPerson() {
    setShowAddPerson(false)
    setEditPerson(null)
    setPersonForm(emptyPersonForm)
    setPersonPassword('')
    setShowPersonPassword(false)
    setGrantEmail('')
    setGrantPassword('')
    setShowGrantPassword(false)
    setGrantSuccess(null)
    setConfirmRemoveLogin(false)
  }

  function openCreateFounder() {
    setFounderCreateForm({ email: '', full_name: '', password: '' })
    setShowFounderCreatePassword(false)
    setFounderCreateSuccess(null)
    createFounderMutation.reset()
    setShowCreateFounder(true)
  }

  function closeCreateFounder() {
    setShowCreateFounder(false)
    setFounderCreateForm({ email: '', full_name: '', password: '' })
    setShowFounderCreatePassword(false)
    setFounderCreateSuccess(null)
  }

  function openEditFounder(f: ManagedUser) {
    setEditFounderForm({ full_name: f.full_name ?? '', password: '' })
    setShowEditFounderPassword(false)
    setConfirmDeleteFounder(false)
    editFounderMutation.reset()
    banLoginMutation.reset()
    deleteFounderMutation.reset()
    setEditFounderId(f.id)
  }

  function closeEditFounder() {
    setEditFounderId(null)
    setEditFounderForm({ full_name: '', password: '' })
    setShowEditFounderPassword(false)
    setConfirmDeleteFounder(false)
  }

  const showPersonModal = showAddPerson || !!editPerson

  return (
    <div className="p-6 space-y-8 min-h-screen bg-[#0d1117]">
      <div>
        <h1 className="text-xl font-semibold text-[#e6edf3]">Settings</h1>
        <p className="text-sm text-[#8b949e] mt-0.5">Manage your team and access</p>
      </div>

      {/* Team members — unified profile + access for non-founders */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-medium text-[#c9d1d9]">Team members</h2>
            <p className="text-[11px] text-[#6e7681] mt-0.5">Profile and login access in one place.</p>
          </div>
          <button
            onClick={openAddPerson}
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
            {(people ?? []).map(person => {
              const login = loginByPersonId.get(person.id)
              return (
                <div
                  key={person.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#21262d]/60 transition-colors',
                    !person.is_active && 'opacity-40',
                  )}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                    style={{ backgroundColor: person.avatar_color ?? '#1d9e75' }}
                  >
                    {person.avatar_initials ?? person.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#e6edf3] truncate">{person.name}</p>
                    <p className="text-xs text-[#6e7681] capitalize truncate">
                      {person.role} · {person.type}
                      {person.default_hourly_rate != null && (
                        <span className="ml-1 text-[#484f58]">· ₹{person.default_hourly_rate}/h</span>
                      )}
                      {person.monthly_salary != null && (
                        <span className="ml-1 text-[#484f58]">· ₹{(person.monthly_salary / 1000).toFixed(0)}K/mo</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {login ? (
                      <span
                        className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#8b949e] max-w-[180px] truncate"
                        title={login.email ?? ''}
                      >
                        <KeyRound className="h-3 w-3 text-[#1d9e75]" />
                        <span className="truncate">{login.email ?? 'login'}</span>
                      </span>
                    ) : (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#484f58]">
                        <LockKeyhole className="h-3 w-3" /> No login
                      </span>
                    )}
                    {login?.banned && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/20">
                        Banned
                      </span>
                    )}
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: person.id, is_active: !person.is_active })}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-md transition-colors',
                        person.is_active
                          ? 'bg-[#1d9e75]/10 text-[#1d9e75] hover:bg-[#1d9e75]/20'
                          : 'bg-[#21262d] text-[#6e7681] hover:bg-[#2d333b]',
                      )}
                    >
                      {person.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => openEditPerson(person)}
                      className="p-1.5 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#21262d] rounded transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
            {(people ?? []).length === 0 && (
              <p className="text-sm text-[#6e7681] py-4 text-center">No team members yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Founders — separate because they have no person record */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-medium text-[#c9d1d9]">Founders</h2>
            <p className="text-[11px] text-[#6e7681] mt-0.5">Admin logins with full access.</p>
          </div>
          <button
            onClick={openCreateFounder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 text-xs transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" /> Create founder
          </button>
        </div>
        <div className="space-y-1">
          {founders.map(f => {
            const isSelf = f.id === myUserId
            return (
              <div
                key={f.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#21262d]/60 transition-colors',
                  f.banned && 'opacity-50',
                )}
              >
                <div className="h-8 w-8 rounded-full bg-[#378add]/15 border border-[#378add]/30 flex items-center justify-center text-[#378add] text-xs font-medium shrink-0">
                  {f.full_name?.slice(0, 2).toUpperCase() ?? '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#e6edf3] truncate">
                    {f.full_name ?? 'Unnamed'}
                    {isSelf && <span className="ml-1.5 text-[10px] text-[#6e7681]">(you)</span>}
                  </p>
                  <p className="text-xs text-[#6e7681] truncate">{f.email ?? 'no email'}</p>
                </div>
                {f.banned && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/20">
                    Banned
                  </span>
                )}
                {!isSelf && (
                  <button
                    onClick={() => openEditFounder(f)}
                    title="Edit founder"
                    className="p-1.5 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#21262d] rounded transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
          {founders.length === 0 && (
            <p className="text-sm text-[#6e7681] py-4 text-center">No founders found.</p>
          )}
        </div>
      </div>

      {/* Add / Edit person modal — includes access controls when editing */}
      {showPersonModal && (
        <Modal
          title={editPerson ? 'Edit team member' : 'Add team member'}
          onClose={closeEditPerson}
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

            <Field label="Avatar colour">
              <div className="flex gap-2 flex-wrap mt-1">
                {AVATAR_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'h-7 w-7 rounded-full transition-all',
                      personForm.avatar_color === color && 'ring-2 ring-offset-2 ring-[#58a6ff] ring-offset-[#161b22] scale-110',
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setPersonForm(f => ({ ...f, avatar_color: color }))}
                  />
                ))}
              </div>
            </Field>

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

            {/* Access section — only when editing an existing person */}
            {editPerson && editPersonLogin && (
              <div className="border-t border-[#30363d] pt-4 space-y-3">
                <p className="text-[11px] uppercase tracking-wide text-[#6e7681]">Access</p>
                <Field label="Email">
                  <div className="text-sm text-[#e6edf3] font-mono px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                    {editPersonLogin.email ?? '—'}
                  </div>
                </Field>
                <Field label="New password (optional)">
                  <div className="relative">
                    <input
                      type={showPersonPassword ? 'text' : 'password'}
                      className={cn(inputCls, 'pr-16')}
                      value={personPassword}
                      onChange={e => setPersonPassword(e.target.value)}
                      placeholder="Leave blank to keep current"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPersonPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8b949e] hover:text-[#e6edf3] px-1.5 py-0.5"
                    >
                      {showPersonPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {personPassword && personPassword.length < 8 && (
                    <p className="text-[11px] text-[#e2a23b] mt-1.5">Must be at least 8 characters.</p>
                  )}
                </Field>
              </div>
            )}

            {editPerson && !editPersonLogin && (
              <div className="border-t border-[#30363d] pt-4 space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[#6e7681]">Access</p>
                  <p className="text-[11px] text-[#6e7681] mt-0.5">No login yet. Grant one below to let them sign in.</p>
                </div>
                {grantSuccess ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[#1d9e75]">
                      <Check className="h-4 w-4" />
                      <p className="text-sm font-medium">Login granted.</p>
                    </div>
                    <p className="text-[11px] text-[#8b949e]">Share these credentials — they can sign in immediately.</p>
                    <CredsBox creds={grantSuccess} />
                  </div>
                ) : (
                  <>
                    <Field label="Email *">
                      <input type="email" className={inputCls} value={grantEmail}
                        onChange={e => setGrantEmail(e.target.value)}
                        placeholder="priya@l3labs.com" />
                    </Field>
                    <Field label="Initial password *">
                      <div className="relative">
                        <input
                          type={showGrantPassword ? 'text' : 'password'}
                          className={cn(inputCls, 'pr-16')}
                          value={grantPassword}
                          onChange={e => setGrantPassword(e.target.value)}
                          placeholder="Min 8 chars"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowGrantPassword(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8b949e] hover:text-[#e6edf3] px-1.5 py-0.5"
                        >
                          {showGrantPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </Field>
                    {grantLoginMutation.isError && (
                      <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                        {(grantLoginMutation.error as Error)?.message ?? 'Grant failed.'}
                      </p>
                    )}
                    <button
                      onClick={() => grantLoginMutation.mutate()}
                      disabled={
                        !grantEmail ||
                        grantPassword.length < 8 ||
                        grantLoginMutation.isPending
                      }
                      className="text-xs px-3 py-1.5 rounded-lg border border-[#58a6ff]/30 text-[#58a6ff] hover:bg-[#58a6ff]/10 transition-colors disabled:opacity-50"
                    >
                      {grantLoginMutation.isPending ? 'Granting…' : 'Grant login access'}
                    </button>
                  </>
                )}
              </div>
            )}

            {updatePersonMutation.isError && (
              <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                {(updatePersonMutation.error as Error)?.message ?? 'Save failed.'}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                onClick={() => editPerson ? updatePersonMutation.mutate() : createPersonMutation.mutate()}
                disabled={
                  !personForm.name ||
                  !personForm.role ||
                  createPersonMutation.isPending ||
                  updatePersonMutation.isPending ||
                  (personPassword.length > 0 && personPassword.length < 8)
                }
              >
                {createPersonMutation.isPending || updatePersonMutation.isPending
                  ? 'Saving…'
                  : editPerson ? 'Save changes' : 'Add member'}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
                onClick={closeEditPerson}
              >
                Cancel
              </button>
            </div>

            {/* Danger zone — login lifecycle, only when a login is linked */}
            {editPerson && editPersonLogin && (
              <div className="border-t border-[#30363d] pt-4 space-y-3">
                <p className="text-[11px] uppercase tracking-wide text-[#6e7681]">Danger zone</p>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[#e6edf3]">{editPersonLogin.banned ? 'Login is banned' : 'Ban login'}</p>
                    <p className="text-[11px] text-[#6e7681]">
                      {editPersonLogin.banned
                        ? 'They cannot sign in. Unban to restore access.'
                        : 'Blocks sign-in but keeps the account and data.'}
                    </p>
                  </div>
                  <button
                    onClick={() => banLoginMutation.mutate({ id: editPersonLogin.id, banned: !editPersonLogin.banned })}
                    disabled={banLoginMutation.isPending}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 shrink-0',
                      editPersonLogin.banned
                        ? 'border-[#1d9e75]/30 text-[#1d9e75] hover:bg-[#1d9e75]/10'
                        : 'border-[#e2a23b]/30 text-[#e2a23b] hover:bg-[#e2a23b]/10',
                    )}
                  >
                    {banLoginMutation.isPending ? '…' : editPersonLogin.banned ? 'Unban' : 'Ban'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[#e6edf3]">Remove login</p>
                    <p className="text-[11px] text-[#6e7681]">
                      Deletes the sign-in account. The person record stays for time tracking.
                    </p>
                  </div>
                  {confirmRemoveLogin ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => removeLoginMutation.mutate(editPersonLogin.id)}
                        disabled={removeLoginMutation.isPending}
                        className="text-xs px-3 py-1.5 rounded-lg bg-[#e24b4a] hover:bg-[#f0504f] text-white transition-colors disabled:opacity-50"
                      >
                        {removeLoginMutation.isPending ? 'Removing…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmRemoveLogin(false)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemoveLogin(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#e24b4a]/30 text-[#e24b4a] hover:bg-[#e24b4a]/10 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>

                {(banLoginMutation.isError || removeLoginMutation.isError) && (
                  <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                    {((banLoginMutation.error || removeLoginMutation.error) as Error)?.message ?? 'Action failed.'}
                  </p>
                )}
              </div>
            )}

            {createPersonMutation.isError && (
              <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                {(createPersonMutation.error as Error)?.message ?? 'Save failed.'}
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Create founder modal */}
      {showCreateFounder && (
        <Modal title="Create founder" onClose={closeCreateFounder}>
          {founderCreateSuccess ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#1d9e75]">
                <Check className="h-5 w-5" />
                <p className="text-sm font-medium">Founder created.</p>
              </div>
              <p className="text-xs text-[#8b949e]">Share these credentials with them — they can sign in immediately.</p>
              <CredsBox creds={founderCreateSuccess} />
              <button
                onClick={closeCreateFounder}
                className="w-full py-2 rounded-lg bg-[#21262d] hover:bg-[#2d333b] text-[#e6edf3] text-sm transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Full name">
                <input className={inputCls} value={founderCreateForm.full_name}
                  onChange={e => setFounderCreateForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Priya Mehta" />
              </Field>
              <Field label="Email *">
                <input type="email" className={inputCls} value={founderCreateForm.email}
                  onChange={e => setFounderCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="priya@l3labs.com" />
              </Field>
              <Field label="Initial password *">
                <div className="relative">
                  <input
                    type={showFounderCreatePassword ? 'text' : 'password'}
                    className={cn(inputCls, 'pr-16')}
                    value={founderCreateForm.password}
                    onChange={e => setFounderCreateForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 chars"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFounderCreatePassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8b949e] hover:text-[#e6edf3] px-1.5 py-0.5"
                  >
                    {showFounderCreatePassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-[11px] text-[#6e7681] mt-1.5">
                  Share this with them — they can change it later.
                </p>
              </Field>

              {createFounderMutation.isError && (
                <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                  {(createFounderMutation.error as Error)?.message ?? 'Create failed.'}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                  onClick={() => createFounderMutation.mutate()}
                  disabled={
                    !founderCreateForm.email ||
                    founderCreateForm.password.length < 8 ||
                    createFounderMutation.isPending
                  }
                >
                  {createFounderMutation.isPending ? 'Creating…' : 'Create founder'}
                </button>
                <button
                  className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
                  onClick={closeCreateFounder}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Edit founder modal */}
      {editFounder && (
        <Modal title="Edit founder" onClose={closeEditFounder}>
          <div className="space-y-4">
            <Field label="Full name">
              <input
                className={inputCls}
                value={editFounderForm.full_name}
                onChange={e => setEditFounderForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Priya Mehta"
              />
            </Field>

            <Field label="Email">
              <div className="text-sm text-[#e6edf3] font-mono px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                {editFounder.email ?? '—'}
              </div>
            </Field>

            <Field label="New password (optional)">
              <div className="relative">
                <input
                  type={showEditFounderPassword ? 'text' : 'password'}
                  className={cn(inputCls, 'pr-16')}
                  value={editFounderForm.password}
                  onChange={e => setEditFounderForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowEditFounderPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8b949e] hover:text-[#e6edf3] px-1.5 py-0.5"
                >
                  {showEditFounderPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {editFounderForm.password && editFounderForm.password.length < 8 && (
                <p className="text-[11px] text-[#e2a23b] mt-1.5">Must be at least 8 characters.</p>
              )}
            </Field>

            {editFounderMutation.isError && (
              <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                {(editFounderMutation.error as Error)?.message ?? 'Save failed.'}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
                onClick={() => editFounderMutation.mutate()}
                disabled={
                  editFounderMutation.isPending ||
                  (editFounderForm.password.length > 0 && editFounderForm.password.length < 8)
                }
              >
                {editFounderMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
                onClick={closeEditFounder}
              >
                Cancel
              </button>
            </div>

            <div className="border-t border-[#30363d] pt-4 space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-[#6e7681]">Danger zone</p>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[#e6edf3]">{editFounder.banned ? 'Founder is banned' : 'Ban founder'}</p>
                  <p className="text-[11px] text-[#6e7681]">
                    {editFounder.banned
                      ? 'They cannot sign in. Unban to restore access.'
                      : 'Blocks sign-in but keeps the account and data.'}
                  </p>
                </div>
                <button
                  onClick={() => banLoginMutation.mutate({ id: editFounder.id, banned: !editFounder.banned })}
                  disabled={banLoginMutation.isPending}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 shrink-0',
                    editFounder.banned
                      ? 'border-[#1d9e75]/30 text-[#1d9e75] hover:bg-[#1d9e75]/10'
                      : 'border-[#e2a23b]/30 text-[#e2a23b] hover:bg-[#e2a23b]/10',
                  )}
                >
                  {banLoginMutation.isPending ? '…' : editFounder.banned ? 'Unban' : 'Ban'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[#e6edf3]">Delete founder</p>
                  <p className="text-[11px] text-[#6e7681]">
                    Permanently removes their login and access. Cannot be undone.
                  </p>
                </div>
                {confirmDeleteFounder ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => deleteFounderMutation.mutate(editFounder.id)}
                      disabled={deleteFounderMutation.isPending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#e24b4a] hover:bg-[#f0504f] text-white transition-colors disabled:opacity-50"
                    >
                      {deleteFounderMutation.isPending ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteFounder(false)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteFounder(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#e24b4a]/30 text-[#e24b4a] hover:bg-[#e24b4a]/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>

              {(banLoginMutation.isError || deleteFounderMutation.isError) && (
                <p className="text-xs text-[#e24b4a] bg-[#e24b4a]/10 border border-[#e24b4a]/20 px-3 py-2 rounded-lg">
                  {((banLoginMutation.error || deleteFounderMutation.error) as Error)?.message ?? 'Action failed.'}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
