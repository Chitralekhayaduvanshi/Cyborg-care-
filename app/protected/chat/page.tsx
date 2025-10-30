import { redirect } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/auth-server"
import { ChatInterface } from "@/components/chat-interface"

export default async function ChatPage() {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="flex-1 w-full flex flex-col">
      <ChatInterface user={user} />
    </div>
  )
}
