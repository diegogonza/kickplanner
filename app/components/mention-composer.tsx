'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { addComment } from '@/app/projects/actions'
import { displayName, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'

export default function MentionComposer({
  taskId,
  projectId,
  members,
  meName,
  meEmail,
  meAvatar,
}: {
  taskId: string
  projectId: string
  members: Member[]
  meName: string | null
  meEmail: string
  meAvatar: string | null
}) {
  const [value, setValue] = useState('')
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = open
    ? members
        .filter((m) => displayName(m).toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : []

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setValue(v)
    const caret = e.target.selectionStart ?? v.length
    const upto = v.slice(0, caret)
    const match = upto.match(/@([\p{L}0-9._-]*)$/u)
    if (match) {
      setQuery(match[1])
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  function pick(m: Member) {
    const name = displayName(m)
    const el = inputRef.current
    const caret = el?.selectionStart ?? value.length
    const upto = value.slice(0, caret).replace(/@([\p{L}0-9._-]*)$/u, '@' + name + ' ')
    const rest = value.slice(caret)
    setValue(upto + rest)
    setMentioned((prev) => (prev.some((x) => x.id === m.user_id) ? prev : [...prev, { id: m.user_id, name }]))
    setOpen(false)
    setTimeout(() => el?.focus(), 0)
  }

  // Solo se envían las menciones cuyo "@Nombre" sigue en el texto
  const activeIds = mentioned.filter((x) => value.includes('@' + x.name)).map((x) => x.id)

  return (
    <form
      className="comment-composer"
      action={async (fd) => {
        await addComment(fd)
        setValue('')
        setMentioned([])
        setOpen(false)
      }}
    >
      <Avatar name={meName} email={meEmail} url={meAvatar} size={28} />
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="mentions" value={activeIds.join(',')} />

      <div style={{ position: 'relative', flex: 1 }}>
        {open && suggestions.length > 0 && (
          <div className="mention-menu">
            {suggestions.map((m) => (
              <button type="button" key={m.user_id} className="mention-item" onClick={() => pick(m)}>
                <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={22} />
                {displayName(m)}
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          name="body"
          value={value}
          onChange={handleChange}
          placeholder="Agregar un comentario…  (@ para mencionar)"
          autoComplete="off"
          required
        />
      </div>

      <button type="submit" className="comment-send" title="Enviar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </form>
  )
}
