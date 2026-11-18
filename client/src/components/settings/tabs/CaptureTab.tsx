import { Bookmark, Video, Bot } from 'lucide-react'
import { BookmarkletPanel } from '../BookmarkletPanel'
import { McpPanel } from '../McpPanel'
import YouTubeBackfillPanel from '../YouTubeBackfillPanel'
import { SettingsSection } from '../SettingsSection'
import type { SettingsTabProps } from '../settingsTabs'

type Props = Pick<SettingsTabProps, 'settings'>

/** Ways of getting things into Memex that you set up once: the bookmarklet and the YouTube backfill. */
export function CaptureTab({ settings }: Props) {
  return (
    <div className="flex flex-col gap-10">
      <SettingsSection icon={<Bookmark size={20} className="text-sky-400" />} title="Bookmarklet">
        <BookmarkletPanel initialKey={typeof settings.bookmarklet_key === 'string' ? settings.bookmarklet_key : null} />
      </SettingsSection>

      <SettingsSection
        icon={<Bot size={20} className="text-accent" />}
        title="AI assistants (MCP)"
        description="Search, read and save your notes from Claude Desktop, Cursor and other MCP apps."
      >
        <McpPanel initiallySet={typeof settings.mcp_key_hash === 'string' && settings.mcp_key_hash.length > 0} />
      </SettingsSection>

      <SettingsSection
        icon={<Video size={20} className="text-red-400" />}
        title="YouTube backfill"
        description="Fetch full descriptions and transcripts for YouTube links you saved earlier."
      >
        <YouTubeBackfillPanel />
      </SettingsSection>
    </div>
  )
}
