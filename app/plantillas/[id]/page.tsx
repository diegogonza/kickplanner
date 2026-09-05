import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import TemplateEditor, { type TemplateTaskRow, type Person } from '@/app/components/template-editor'
import type { Tag } from '@/app/projects/statuses'

const TYPE_LABEL: Record<string, string> = { seo: 'SEO', web: 'WEB', general: 'General' }

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: template } = await supabase
    .from('templates')
    .select('id, name, type, description')
    .eq('id', id)
    .maybeSingle()
  if (!template) redirect('/plantillas')

  const { data: taskRows } = await supabase
    .from('template_tasks')
    .select('id, parent_id, title, priority, due_offset_days, description, drive_url, assignee_id, position, created_at')
    .eq('template_id', id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  const tasks = (taskRows ?? []) as TemplateTaskRow[]

  const { data: tagRows } = await supabase.from('tags').select('id, name, color').order('name')
  const allTags = (tagRows ?? []) as Tag[]

  const { data: peopleRows } = await supabase.rpc('my_collaborators')
  const people = (peopleRows ?? []) as Person[]

  const tagsByTask: Record<string, Tag[]> = {}
  if (tasks.length > 0) {
    const { data: tt } = await supabase
      .from('template_task_tags')
      .select('template_task_id, tags(id, name, color)')
      .in('template_task_id', tasks.map((t) => t.id))
    for (const row of tt ?? []) {
      const tag = (row as { tags: unknown }).tags as Tag
      if (!tag) continue
      ;(tagsByTask[(row as { template_task_id: string }).template_task_id] ??= []).push(tag)
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar active="plantillas" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">
              <a href="/plantillas" style={{ color: 'var(--text-3)' }}>Plantillas</a> / <b>{template.name}</b>
            </div>
            <h1 className="page-title" style={{ gap: 10 }}>
              {template.name}
              <span className={`ptype ${template.type === 'seo' ? 'pt-seo' : template.type === 'web' ? 'pt-web' : 'pt-general'}`}>
                {TYPE_LABEL[template.type] ?? 'General'}
              </span>
            </h1>
          </div>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="w-full">
            <TemplateEditor templateId={template.id} templateName={template.name} tasks={tasks} tagsByTask={tagsByTask} allTags={allTags} people={people} />
          </div>
        </div>
      </div>
    </div>
  )
}
