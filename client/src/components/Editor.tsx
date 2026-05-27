import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Heading1, 
  Heading2, 
  Code,
  CheckSquare,
  Link as LinkIcon
} from 'lucide-react';

interface EditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export default function Editor({ content, onChange, placeholder = 'Start writing...', readOnly = false }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className={`w-full flex flex-col ${readOnly ? '' : 'border border-white/10 rounded-xl overflow-hidden bg-bg'}`}>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-white/5 bg-surface/50">
          <MenuButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
            active={editor.isActive('heading', { level: 1 })}
            icon={<Heading1 size={16} />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
            active={editor.isActive('heading', { level: 2 })}
            icon={<Heading2 size={16} />} 
          />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleBold().run()} 
            active={editor.isActive('bold')}
            icon={<Bold size={16} />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleItalic().run()} 
            active={editor.isActive('italic')}
            icon={<Italic size={16} />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleCode().run()} 
            active={editor.isActive('code')}
            icon={<Code size={16} />} 
          />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleBulletList().run()} 
            active={editor.isActive('bulletList')}
            icon={<List size={16} />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleOrderedList().run()} 
            active={editor.isActive('orderedList')}
            icon={<ListOrdered size={16} />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleTaskList().run()} 
            active={editor.isActive('taskList')}
            icon={<CheckSquare size={16} />} 
          />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleBlockquote().run()} 
            active={editor.isActive('blockquote')}
            icon={<Quote size={16} />} 
          />
        </div>
      )}
      
      <div className="prose prose-invert max-w-none p-4 min-h-[150px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function MenuButton({ onClick, active, icon }: { onClick: () => void, active?: boolean, icon: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); onClick(); }}
      className={`p-2 rounded-md transition-all ${
        active ? 'bg-accent text-bg' : 'text-ink-muted hover:bg-white/5 hover:text-ink'
      }`}
    >
      {icon}
    </button>
  );
}
