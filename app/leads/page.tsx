'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  getLeads, getLeadsKpi, createLead, updateLead,
  type LeadsFilter, PAGE_SIZE,
} from '@/lib/queries/leads'
import { getMyProfile } from '@/lib/queries/profile'
import { formatDate } from '@/lib/utils/date'
import { formatINR } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import {
  Plus, X, Search, SlidersHorizontal, ChevronDown,
  Target, TrendingUp, ThumbsDown, Sparkles, Percent, IndianRupee,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Lead, LeadInsert, LeadStatus, LeadSource, ConnectVia, UserProfile } from '@/lib/supabase/types'

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: LeadStatus | 'all'; label: string }[] = [
  { value: 'all',            label: 'All' },
  { value: 'initial_call',   label: 'Initial Call' },
  { value: 'interested',     label: 'Interested' },
  { value: 'gave_quote',     label: 'Gave Quote' },
  { value: 'done',           label: 'Converted' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'not_converted',  label: 'Not Converted' },
]

const SOURCE_OPTIONS: { value: LeadSource | 'all'; label: string }[] = [
  { value: 'all',      label: 'All Sources' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'relation', label: 'Relation' },
  { value: 'scouting', label: 'Scouting' },
  { value: 'pa',       label: 'PA' },
  { value: 'inbound',  label: 'Inbound' },
]

const CONNECT_VIA_OPTIONS: { value: ConnectVia | 'all'; label: string }[] = [
  { value: 'all',      label: 'All Channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email',    label: 'Email' },
  { value: 'call',     label: 'Call' },
]

const ALL_COLUMNS = [
  { key: 'id',                     label: '#',              always: true  },
  { key: 'date_of_first_approach', label: 'Date',           always: false },
  { key: 'client_name',            label: 'Client',         always: true  },
  { key: 'company_name',           label: 'Company',        always: false },
  { key: 'contact_detail',         label: 'Contact',        always: false },
  { key: 'connect_via',            label: 'Via',            always: false },
  { key: 'source',                 label: 'Source',         always: false },
  { key: 'poc',                    label: 'POC',            always: false },
  { key: 'quotation_amount',       label: 'Quotation',      always: false },
  { key: 'converted_amount',       label: 'Conv. Amount',   always: false },
  { key: 'converted_date',         label: 'Conv. Date',     always: false },
  { key: 'last_contacted_at',      label: 'Last Contacted', always: false },
  { key: 'status',                 label: 'Status',         always: true  },
  { key: 'remark',                 label: 'Remark',         always: false },
] as const

type ColKey = typeof ALL_COLUMNS[number]['key']

const DEFAULT_VISIBLE: ColKey[] = [
  'id', 'date_of_first_approach', 'client_name', 'company_name',
  'connect_via', 'source', 'poc', 'quotation_amount',
  'converted_amount', 'last_contacted_at', 'status',
]

// ── Style helpers ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<LeadStatus, { bg: string; text: string; label: string }> = {
  initial_call:   { bg: 'bg-[#378ADD]/15', text: 'text-[#378ADD]', label: 'Initial Call'   },
  interested:     { bg: 'bg-[#1D9E75]/15', text: 'text-[#1D9E75]', label: 'Interested'     },
  gave_quote:     { bg: 'bg-[#EF9F27]/15', text: 'text-[#EF9F27]', label: 'Gave Quote'     },
  done:           { bg: 'bg-[#1D9E75]/20', text: 'text-[#1D9E75]', label: 'Converted'      },
  not_interested: { bg: 'bg-[#484f58]/30', text: 'text-[#6e7681]', label: 'Not Interested' },
  not_converted:  { bg: 'bg-[#E24B4A]/15', text: 'text-[#E24B4A]', label: 'Not Converted'  },
}

const SOURCE_LABEL: Record<LeadSource, string> = {
  linkedin: 'LinkedIn', relation: 'Relation', scouting: 'Scouting', pa: 'PA', inbound: 'Inbound',
}

const CONNECT_VIA_LABEL: Record<ConnectVia, string> = {
  whatsapp: 'WhatsApp', facebook: 'Facebook', linkedin: 'LinkedIn', email: 'Email', call: 'Call',
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap', s.bg, s.text)}>
      {s.label}
    </span>
  )
}

function contactedInfo(date: string | null): { color: string; label: string; title: string } {
  if (!date) return { color: '#484f58', label: 'Never', title: 'Never contacted' }
  const days = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86_400_000)
  if (days === 0) return { color: '#1D9E75', label: 'Today',     title: `Last contacted: ${date}` }
  if (days <= 7)  return { color: '#1D9E75', label: `${days}d ago`, title: `Last contacted: ${date}` }
  if (days <= 14) return { color: '#EF9F27', label: `${days}d ago`, title: `Last contacted: ${date}` }
  return { color: '#E24B4A', label: `${days}d ago`, title: `Last contacted: ${date} — overdue` }
}

function ContactedDot({ date }: { date: string | null }) {
  const { color, label, title } = contactedInfo(date)
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs tabular-nums" style={{ color }}>{label}</span>
    </span>
  )
}

// ── Empty form ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  date_of_first_approach: new Date().toISOString().slice(0, 10),
  client_name:      '',
  company_name:     '',
  contact_detail:   '',
  connect_via:      '' as ConnectVia | '',
  requirement:      '',
  source:           '' as LeadSource | '',
  mediator:         '',
  poc:              '',
  quotation_amount: '',
  status:           'initial_call' as LeadStatus,
  remark:           '',
  last_contacted_at: '',
  converted_amount: '',
  converted_date:   '',
}

type FormState = typeof EMPTY_FORM

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const queryClient  = useQueryClient()
  const supabase     = createClient()

  // ── URL params ──
  const statusFilter     = (searchParams.get('status')      ?? 'all') as LeadStatus | 'all'
  const sourceFilter     = (searchParams.get('source')      ?? 'all') as LeadSource | 'all'
  const connectViaFilter = (searchParams.get('connect_via') ?? 'all') as ConnectVia | 'all'
  const pocFilter        = searchParams.get('poc')        ?? ''
  const dateFrom         = searchParams.get('date_from')  ?? ''
  const dateTo           = searchParams.get('date_to')    ?? ''
  const searchFilter     = searchParams.get('search')     ?? ''

  // Current month is no longer applied by default — leads are listed across
  // all dates in descending order. The "This month" shortcut button still
  // populates the date pickers so founders can scope the view manually.
  const { monthStart, monthEnd } = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { monthStart: fmt(start), monthEnd: fmt(end) }
  }, [])

  // Empty string = no filter for that side of the period.
  const effectiveFrom = dateFrom
  const effectiveTo   = dateTo
  const hasPeriod     = !!(effectiveFrom || effectiveTo)
  const isThisMonth   = effectiveFrom === monthStart && effectiveTo === monthEnd

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === 'all') params.delete(key)
    else params.set(key, value)
    router.replace(`${pathname}?${params.toString()}`)
  }

  function setPeriod(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (from) params.set('date_from', from); else params.delete('date_from')
    if (to)   params.set('date_to',   to);   else params.delete('date_to')
    router.replace(`${pathname}?${params.toString()}`)
  }

  function clearFilters() {
    router.replace(pathname)
  }

  const activeFilter: LeadsFilter = useMemo(() => ({
    status:      statusFilter !== 'all' ? statusFilter : undefined,
    source:      sourceFilter !== 'all' ? sourceFilter : undefined,
    connect_via: connectViaFilter !== 'all' ? connectViaFilter : undefined,
    poc:         pocFilter    || undefined,
    dateFrom:    effectiveFrom || undefined,
    dateTo:      effectiveTo   || undefined,
    search:      searchFilter  || undefined,
  }), [statusFilter, sourceFilter, connectViaFilter, pocFilter, effectiveFrom, effectiveTo, searchFilter])

  const hasActiveFilters =
    statusFilter !== 'all' || sourceFilter !== 'all' || connectViaFilter !== 'all' ||
    !!pocFilter || hasPeriod || !!searchFilter

  // ── Column visibility ──
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE))
  const [showColMenu,  setShowColMenu]  = useState(false)
  const [showFilter,   setShowFilter]   = useState(false)

  function toggleCol(key: ColKey) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ── Modals ──
  const [showAdd,  setShowAdd]  = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [form,     setForm]     = useState<FormState>(EMPTY_FORM)

  // ── Data: current user + founders ──
  const { data: myProfile } = useQuery({
    queryKey: ['my_profile'],
    queryFn:  getMyProfile,
    staleTime: 300_000,
  })

  const { data: founders } = useQuery({
    queryKey: ['user_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_profiles').select('*').order('full_name')
      if (error) throw error
      return data as UserProfile[]
    },
    staleTime: 300_000,
  })

  function openAdd() {
    setForm({ ...EMPTY_FORM, poc: myProfile?.full_name ?? '' })
    setShowAdd(true)
  }

  function openEdit(lead: Lead) {
    setForm({
      date_of_first_approach: lead.date_of_first_approach,
      client_name:      lead.client_name      ?? '',
      company_name:     lead.company_name     ?? '',
      contact_detail:   lead.contact_detail   ?? '',
      connect_via:      lead.connect_via,
      requirement:      lead.requirement      ?? '',
      source:           lead.source,
      mediator:         lead.mediator         ?? '',
      poc:              lead.poc              ?? '',
      quotation_amount: lead.quotation_amount  != null ? String(lead.quotation_amount)  : '',
      status:           lead.status,
      remark:           lead.remark           ?? '',
      last_contacted_at: lead.last_contacted_at ?? '',
      converted_amount: lead.converted_amount != null ? String(lead.converted_amount) : '',
      converted_date:   lead.converted_date   ?? '',
    })
    setEditLead(lead)
  }

  function closeModal() { setShowAdd(false); setEditLead(null) }

  // ── KPI — same period as the table; all-time when no period set ──
  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ['leads_kpi', effectiveFrom, effectiveTo],
    queryFn:  () => getLeadsKpi(effectiveFrom || undefined, effectiveTo || undefined),
    staleTime: 30_000,
  })

  // ── Period label ──
  const salesPeriodLabel = useMemo(() => {
    if (!hasPeriod) return 'All time'
    if (isThisMonth) return `This month · ${formatDate(effectiveFrom, 'dd MMM')} – ${formatDate(effectiveTo, 'dd MMM yy')}`
    if (effectiveFrom && effectiveTo) return `${formatDate(effectiveFrom, 'dd MMM yy')} – ${formatDate(effectiveTo, 'dd MMM yy')}`
    if (effectiveFrom) return `From ${formatDate(effectiveFrom, 'dd MMM yy')}`
    return `Until ${formatDate(effectiveTo, 'dd MMM yy')}`
  }, [hasPeriod, isThisMonth, effectiveFrom, effectiveTo])

  // ── Infinite scroll (offset-based pagination) ──
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['leads', activeFilter],
    queryFn:  ({ pageParam }) => getLeads(activeFilter, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 30_000,
  })

  const leads = useMemo(() => data?.pages.flatMap(p => p) ?? [], [data])

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage() },
      { threshold: 0.1 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (payload: LeadInsert) => createLead(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads_kpi'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Lead> }) => updateLead(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads_kpi'] })
      closeModal()
    },
  })

  function handleSubmit() {
    if (!form.connect_via || !form.source) return
    const payload = {
      date_of_first_approach: form.date_of_first_approach,
      client_name:      form.client_name      || null,
      company_name:     form.company_name     || null,
      contact_detail:   form.contact_detail   || null,
      connect_via:      form.connect_via as ConnectVia,
      requirement:      form.requirement      || null,
      source:           form.source as LeadSource,
      mediator:         form.mediator         || null,
      poc:              form.poc              || null,
      quotation_amount: form.quotation_amount  ? parseFloat(form.quotation_amount)  : null,
      status:           form.status,
      remark:           form.remark           || null,
      last_contacted_at: form.last_contacted_at || null,
      converted_amount: form.converted_amount ? parseFloat(form.converted_amount) : null,
      converted_date:   form.converted_date   || null,
    }
    if (editLead) updateMutation.mutate({ id: editLead.id, updates: payload })
    else          createMutation.mutate(payload as LeadInsert)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 min-h-screen bg-[#0d1117]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Leads</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            {isLoading ? '…' : `${leads.length} lead${leads.length !== 1 ? 's' : ''}${hasNextPage ? '+' : ''}`}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add lead
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Leads"   value={kpi?.total        ?? 0} icon={Target}    accent="default" loading={kpiLoading} />
        <KpiCard label="Converted"     value={kpi?.converted    ?? 0} icon={TrendingUp} accent="green"  loading={kpiLoading} />
        <KpiCard label="Not Converted" value={kpi?.notConverted ?? 0} icon={ThumbsDown} accent="red"    loading={kpiLoading} />
        <KpiCard label="Interested"    value={kpi?.interested   ?? 0} icon={Sparkles}  accent="amber"   loading={kpiLoading} />
        <KpiCard
          label="Conversion Rate"
          value={kpi ? `${kpi.conversionRate}%` : '—'}
          icon={Percent}
          accent={kpi && kpi.conversionRate >= 30 ? 'green' : 'amber'}
          loading={kpiLoading}
        />
        {/* Total Sales — period-aware */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 lg:col-span-1">
          {kpiLoading ? (
            <>
              <Skeleton className="h-3 w-24 mb-3 bg-[#21262d]" />
              <Skeleton className="h-7 w-24 bg-[#21262d]" />
            </>
          ) : (
            <>
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-medium text-[#8b949e] leading-snug">Total Sales</p>
                <IndianRupee className="h-3.5 w-3.5 text-[#484f58] flex-shrink-0 mt-0.5" />
              </div>
              <p className="text-2xl font-semibold tracking-tight leading-none tabular-nums text-[#1D9E75]">
                {formatINR(kpi?.totalSales ?? 0)}
              </p>
              <p className="text-[10px] text-[#6e7681] mt-1.5 truncate">{salesPeriodLabel}</p>
            </>
          )}
        </div>
      </div>

      {/* Table filter bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#30363d] rounded-lg bg-[#161b22] text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] transition-colors"
              placeholder="Search client, company, contact…"
              value={searchFilter}
              onChange={e => setParam('search', e.target.value)}
            />
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setParam('status', opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-[#388bfd]/20 text-[#58a6ff] border border-[#388bfd]/40'
                    : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* More filters */}
          <button
            onClick={() => setShowFilter(f => !f)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors',
              showFilter
                ? 'border-[#388bfd]/40 bg-[#388bfd]/10 text-[#58a6ff]'
                : 'border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>

          {/* Column visibility */}
          <div className="relative">
            <button
              onClick={() => setShowColMenu(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#30363d] text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
            >
              Columns <ChevronDown className="h-3 w-3" />
            </button>
            {showColMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-20 py-1">
                {ALL_COLUMNS.filter(c => !c.always).map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#c9d1d9] hover:bg-[#21262d] cursor-pointer">
                    <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="accent-[#58a6ff]" />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* Extended filters panel */}
        {showFilter && (
          <div className="flex flex-wrap gap-3 p-4 rounded-lg border border-[#30363d] bg-[#161b22]">
            <SelectFilter label="Source"  value={sourceFilter}     options={SOURCE_OPTIONS}       onChange={v => setParam('source', v)} />
            <SelectFilter label="Via"     value={connectViaFilter} options={CONNECT_VIA_OPTIONS}  onChange={v => setParam('connect_via', v)} />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#6e7681] uppercase tracking-wide">POC</label>
              <select
                className="text-sm border border-[#30363d] rounded-lg px-3 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                value={pocFilter}
                onChange={e => setParam('poc', e.target.value)}
              >
                <option value="">All POCs</option>
                {founders?.map(f => (
                  <option key={f.id} value={f.full_name ?? ''}>{f.full_name ?? '—'}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#6e7681] uppercase tracking-wide">Period from</label>
              <input
                type="date"
                className="text-sm border border-[#30363d] rounded-lg px-3 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                value={effectiveFrom}
                onChange={e => setParam('date_from', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#6e7681] uppercase tracking-wide">Period to</label>
              <input
                type="date"
                className="text-sm border border-[#30363d] rounded-lg px-3 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                value={effectiveTo}
                onChange={e => setParam('date_to', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 justify-end">
              <span className="text-[11px] text-transparent uppercase tracking-wide select-none">.</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPeriod(monthStart, monthEnd)}
                  disabled={isThisMonth}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Scope to current month"
                >
                  This month
                </button>
                {hasPeriod && (
                  <button
                    onClick={() => setPeriod('', '')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
                    title="Show leads from all dates"
                  >
                    All time
                  </button>
                )}
              </div>
            </div>
            <p className="basis-full text-[11px] text-[#484f58] italic mt-1">
              Period drives the table (date of first approach) and the sales KPI (converted date). Leave both empty to show all leads.
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-none bg-[#21262d]/40" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center">
            <Target className="h-8 w-8 mx-auto text-[#484f58] mb-3" />
            <p className="text-sm text-[#6e7681]">No leads found</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-[#58a6ff] hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  {ALL_COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                    <th key={col.key} className={cn(
                      'px-4 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide whitespace-nowrap',
                      (col.key === 'quotation_amount' || col.key === 'converted_amount') ? 'text-right' : 'text-left',
                    )}>
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-[11px] font-medium text-[#6e7681] uppercase tracking-wide text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      'border-b border-[#30363d]/60 last:border-0 hover:bg-[#21262d]/40 transition-colors cursor-pointer',
                      i % 2 === 1 && 'bg-[#0d1117]/30',
                    )}
                    onClick={() => openEdit(lead)}
                  >
                    {visibleCols.has('id') && (
                      <td className="px-4 py-3 text-xs text-[#6e7681] tabular-nums">{lead.id}</td>
                    )}
                    {visibleCols.has('date_of_first_approach') && (
                      <td className="px-4 py-3 text-xs text-[#8b949e] whitespace-nowrap">
                        {formatDate(lead.date_of_first_approach, 'dd MMM yy')}
                      </td>
                    )}
                    {visibleCols.has('client_name') && (
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="font-medium text-[#c9d1d9] truncate">{lead.client_name || '—'}</p>
                      </td>
                    )}
                    {visibleCols.has('company_name') && (
                      <td className="px-4 py-3 text-xs text-[#8b949e] max-w-[140px]">
                        <span className="truncate block">{lead.company_name || '—'}</span>
                      </td>
                    )}
                    {visibleCols.has('contact_detail') && (
                      <td className="px-4 py-3 text-xs text-[#8b949e] max-w-[140px]">
                        <span className="truncate block">{lead.contact_detail || '—'}</span>
                      </td>
                    )}
                    {visibleCols.has('connect_via') && (
                      <td className="px-4 py-3 text-xs text-[#8b949e]">{CONNECT_VIA_LABEL[lead.connect_via]}</td>
                    )}
                    {visibleCols.has('source') && (
                      <td className="px-4 py-3 text-xs text-[#8b949e]">{SOURCE_LABEL[lead.source]}</td>
                    )}
                    {visibleCols.has('poc') && (
                      <td className="px-4 py-3 text-xs text-[#8b949e]">{lead.poc || '—'}</td>
                    )}
                    {visibleCols.has('quotation_amount') && (
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-[#8b949e]">
                        {lead.quotation_amount != null
                          ? `₹${lead.quotation_amount.toLocaleString('en-IN')}`
                          : <span className="text-[#484f58]">—</span>}
                      </td>
                    )}
                    {visibleCols.has('converted_amount') && (
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {lead.converted_amount != null
                          ? <span className="text-[#1D9E75] font-medium">{formatINR(lead.converted_amount)}</span>
                          : <span className="text-[#484f58]">—</span>}
                      </td>
                    )}
                    {visibleCols.has('converted_date') && (
                      <td className="px-4 py-3 text-xs text-[#8b949e] whitespace-nowrap">
                        {lead.converted_date ? formatDate(lead.converted_date, 'dd MMM yy') : <span className="text-[#484f58]">—</span>}
                      </td>
                    )}
                    {visibleCols.has('last_contacted_at') && (
                      <td className="px-4 py-3"><ContactedDot date={lead.last_contacted_at} /></td>
                    )}
                    {visibleCols.has('status') && (
                      <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                    )}
                    {visibleCols.has('remark') && (
                      <td className="px-4 py-3 text-xs text-[#6e7681] max-w-[200px]">
                        <span className="truncate block">{lead.remark || '—'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(lead)}
                        className="text-xs text-[#6e7681] hover:text-[#58a6ff] transition-colors px-2 py-1 rounded hover:bg-[#21262d]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div ref={sentinelRef} className="h-4" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <div className="h-4 w-4 rounded-full border-2 border-[#30363d] border-t-[#58a6ff] animate-spin" />
              </div>
            )}
            {!hasNextPage && leads.length > 0 && (
              <p className="text-center text-xs text-[#484f58] py-4">All {leads.length} leads loaded</p>
            )}
          </div>
        )}
      </div>

      {/* Lead form modal */}
      {(showAdd || editLead) && (
        <LeadFormModal
          form={form}
          setForm={setForm}
          founders={founders ?? []}
          onSubmit={handleSubmit}
          onClose={closeModal}
          isSaving={isSaving}
          isEdit={!!editLead}
          error={createMutation.error?.message || updateMutation.error?.message}
        />
      )}

      {showColMenu && <div className="fixed inset-0 z-10" onClick={() => setShowColMenu(false)} />}
    </div>
  )
}

// ── LeadFormModal ─────────────────────────────────────────────────────────────

interface LeadFormModalProps {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  founders: UserProfile[]
  onSubmit: () => void
  onClose: () => void
  isSaving: boolean
  isEdit: boolean
  error?: string
}

function LeadFormModal({ form, setForm, founders, onSubmit, onClose, isSaving, isEdit, error }: LeadFormModalProps) {
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [setForm])

  // Auto-fill converted_date when status flips to 'done'
  function handleStatusChange(val: LeadStatus) {
    setForm(prev => ({
      ...prev,
      status: val,
      converted_date: val === 'done' && !prev.converted_date
        ? new Date().toISOString().slice(0, 10)
        : prev.converted_date,
    }))
  }

  const isValid = !!form.connect_via && !!form.source
  const showConvertedFields = form.status === 'done'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl shadow-2xl mb-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d]">
          <h2 className="text-sm font-semibold text-[#e6edf3]">{isEdit ? 'Edit lead' : 'Add lead'}</h2>
          <button onClick={onClose} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Row 1: Date + Status */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of first approach">
              <input type="date" className={inputCls} value={form.date_of_first_approach} onChange={e => set('date_of_first_approach', e.target.value)} />
            </Field>
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={e => handleStatusChange(e.target.value as LeadStatus)}>
                {STATUS_OPTIONS.filter(o => o.value !== 'all').map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Converted fields — shown only when status = done */}
          {showConvertedFields && (
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border border-[#1D9E75]/30 bg-[#1D9E75]/5">
              <Field label="Converted amount (₹)">
                <input
                  type="number"
                  className={inputCls}
                  placeholder="Final agreed amount"
                  value={form.converted_amount}
                  onChange={e => set('converted_amount', e.target.value)}
                />
              </Field>
              <Field label="Converted date">
                <input
                  type="date"
                  className={inputCls}
                  value={form.converted_date}
                  onChange={e => set('converted_date', e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* Row 2: Client + Company */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Client name">
              <input className={inputCls} placeholder="e.g. John Doe" value={form.client_name} onChange={e => set('client_name', e.target.value)} />
            </Field>
            <Field label="Company name">
              <input className={inputCls} placeholder="e.g. Acme Corp" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
            </Field>
          </div>

          {/* Row 3: Contact + Via */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact detail">
              <input className={inputCls} placeholder="Phone or email" value={form.contact_detail} onChange={e => set('contact_detail', e.target.value)} />
            </Field>
            <Field label="Connect via *">
              <select className={inputCls} value={form.connect_via} onChange={e => set('connect_via', e.target.value as ConnectVia)}>
                <option value="">Select…</option>
                {CONNECT_VIA_OPTIONS.filter(o => o.value !== 'all').map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Row 4: Source + Mediator */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Source *">
              <select className={inputCls} value={form.source} onChange={e => set('source', e.target.value as LeadSource)}>
                <option value="">Select…</option>
                {SOURCE_OPTIONS.filter(o => o.value !== 'all').map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Mediator">
              <input className={inputCls} placeholder="Referral name" value={form.mediator} onChange={e => set('mediator', e.target.value)} />
            </Field>
          </div>

          {/* Row 5: POC + Quotation */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="POC">
              <select className={inputCls} value={form.poc} onChange={e => set('poc', e.target.value)}>
                <option value="">— None —</option>
                {founders.map(f => (
                  <option key={f.id} value={f.full_name ?? ''}>{f.full_name ?? f.id}</option>
                ))}
              </select>
            </Field>
            <Field label="Quotation amount (₹)">
              <input type="number" className={inputCls} placeholder="e.g. 150000" value={form.quotation_amount} onChange={e => set('quotation_amount', e.target.value)} />
            </Field>
          </div>

          {/* Row 6: Last contacted */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Last contacted at">
              <input type="date" className={inputCls} value={form.last_contacted_at} onChange={e => set('last_contacted_at', e.target.value)} />
            </Field>
          </div>

          {/* Requirement */}
          <Field label="Requirement">
            <textarea className={cn(inputCls, 'resize-none h-16')} placeholder="What does the client need?" value={form.requirement} onChange={e => set('requirement', e.target.value)} />
          </Field>

          {/* Remark */}
          <Field label="Remark">
            <textarea className={cn(inputCls, 'resize-none h-16')} placeholder="Internal notes" value={form.remark} onChange={e => set('remark', e.target.value)} />
          </Field>

          {error && <p className="text-xs text-[#E24B4A]">{error}</p>}
        </div>

        <div className="flex gap-2 px-6 pb-5">
          <button
            className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm transition-colors disabled:opacity-50"
            onClick={onSubmit}
            disabled={!isValid || isSaving}
          >
            {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create lead'}
          </button>
          <button
            className="px-4 py-2 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] text-sm transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const inputCls =
  'w-full text-sm border border-[#30363d] rounded-lg px-3 py-2 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] placeholder-[#6e7681] transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[#8b949e] block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

interface SelectFilterProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}

function SelectFilter({ label, value, options, onChange }: SelectFilterProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#6e7681] uppercase tracking-wide">{label}</label>
      <select
        className="text-sm border border-[#30363d] rounded-lg px-3 py-1.5 bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  accent?: 'default' | 'green' | 'amber' | 'red'
  loading?: boolean
}

function KpiCard({ label, value, icon: Icon, accent = 'default', loading }: KpiCardProps) {
  const colorMap = { default: 'text-[#e6edf3]', green: 'text-[#1D9E75]', amber: 'text-[#EF9F27]', red: 'text-[#E24B4A]' }
  if (loading) {
    return (
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <Skeleton className="h-3 w-24 mb-3 bg-[#21262d]" />
        <Skeleton className="h-7 w-16 bg-[#21262d]" />
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-[#8b949e] leading-snug">{label}</p>
        <Icon className="h-3.5 w-3.5 text-[#484f58] flex-shrink-0 mt-0.5" />
      </div>
      <p className={cn('text-2xl font-semibold tracking-tight leading-none tabular-nums', colorMap[accent])}>
        {value}
      </p>
    </div>
  )
}
