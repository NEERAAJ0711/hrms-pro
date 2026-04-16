import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Check, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/lib/auth";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  leave_request: "📋",
  leave_submitted: "📋",
  leave_approved: "✅",
  leave_rejected: "❌",
  payroll_processed: "💰",
  payroll_paid: "💳",
  loan_request: "🏦",
  loan_submitted: "🏦",
  loan_approved: "✅",
  loan_rejected: "❌",
  profile_update_request: "👤",
  profile_update_approved: "✅",
  profile_update_rejected: "❌",
};

const TYPE_COLORS: Record<string, string> = {
  leave_approved: "bg-green-50 border-green-200",
  loan_approved: "bg-green-50 border-green-200",
  payroll_paid: "bg-blue-50 border-blue-200",
  payroll_processed: "bg-blue-50 border-blue-200",
  leave_rejected: "bg-red-50 border-red-200",
  loan_rejected: "bg-red-50 border-red-200",
  profile_update_request: "bg-blue-50 border-blue-200",
  profile_update_approved: "bg-green-50 border-green-200",
  profile_update_rejected: "bg-red-50 border-red-200",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60000,
  });

  // Real-time notifications via Server-Sent Events
  useEffect(() => {
    if (!user) return;
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource("/api/notifications/stream");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "notification") {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          }
        } catch {}
      };
      es.onerror = () => {
        es?.close();
        retryTimeout = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/notifications/clear"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNotificationClick = (n: Notification) => {
    if (!n.isRead) markReadMutation.mutate(n.id);
    if (n.link) {
      setOpen(false);
      setLocation(n.link);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(prev => !prev)}
        data-testid="button-notification-bell"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border bg-white shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <span className="font-semibold text-sm text-gray-800">
              Notifications {unreadCount > 0 && <span className="text-blue-600">({unreadCount} new)</span>}
            </span>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-800" onClick={() => markAllReadMutation.mutate()}>
                  <Check className="h-3 w-3 mr-1" /> Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700" onClick={() => clearAllMutation.mutate()}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-10 w-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const icon = TYPE_ICONS[n.type] || "🔔";
                const colorClass = TYPE_COLORS[n.type] || "";
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? "bg-blue-50/50" : ""}`}
                  >
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base border ${colorClass || "bg-gray-100 border-gray-200"}`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-sm font-medium truncate ${!n.isRead ? "text-gray-900" : "text-gray-600"}`}>{n.title}</p>
                        {!n.isRead && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1" />}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        {n.link && <ExternalLink className="inline h-3 w-3 ml-1 opacity-50" />}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
