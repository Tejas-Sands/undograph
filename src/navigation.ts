import { FileText, History, LayoutDashboard, MessageSquare, Users } from 'lucide-react'

export type View = 'overview' | 'sources' | 'sessions' | 'replies' | 'history'
export const views: { id: View; label: string; title: string; icon: typeof FileText }[] = [
  { id: 'overview', label: 'Overview', title: 'Workspace overview', icon: LayoutDashboard },
  { id: 'sources', label: 'Sources', title: 'Sources', icon: FileText },
  { id: 'sessions', label: 'Sessions', title: 'Agent sessions', icon: Users },
  { id: 'replies', label: 'Replies', title: 'Reply queue', icon: MessageSquare },
  { id: 'history', label: 'Repair history', title: 'Repair history', icon: History },
]
