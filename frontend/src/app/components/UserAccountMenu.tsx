import {
  CircleUserRound,
  CreditCard,
  FileAudio2,
  History,
  LogOut,
  Settings,
  User,
  WalletCards,
} from 'lucide-react';
import type { CustomerUser } from '../customer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

function statusLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export function UserAccountMenu({
  onLogout,
  onNavigate,
  user,
}: {
  onLogout: () => Promise<void> | void;
  onNavigate: (href: string, replace?: boolean) => void;
  user: CustomerUser;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D2CCBE] bg-white/88 text-[#5A5048] shadow-[0_10px_28px_rgba(55,58,64,0.08)] transition hover:border-[#C39680] hover:text-[#AE6C4A]"
        >
          <CircleUserRound className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[260px] rounded-2xl border border-[#D2CCBE] bg-[#F8F3EC] p-2 text-[#373A40] shadow-[0_24px_60px_rgba(55,58,64,0.18)]"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <div className="text-sm font-semibold text-[#2F343B]">{user.email}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[#8D5D45]">{statusLabel(user.packageType)} package</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#E1D3C3]" />
        <DropdownMenuItem className="rounded-xl px-3 py-2 text-[#4F4740] focus:bg-[#EFE2D1] focus:text-[#AE6C4A]" onSelect={() => onNavigate('/dashboard')}>
          <FileAudio2 className="h-4 w-4" />
          Voice Workspace
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl px-3 py-2 text-[#4F4740] focus:bg-[#EFE2D1] focus:text-[#AE6C4A]" onSelect={() => onNavigate('/account?section=profile')}>
          <User className="h-4 w-4" />
          My Account
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl px-3 py-2 text-[#4F4740] focus:bg-[#EFE2D1] focus:text-[#AE6C4A]" onSelect={() => onNavigate('/account?section=tokens')}>
          <WalletCards className="h-4 w-4" />
          Minute Balance
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl px-3 py-2 text-[#4F4740] focus:bg-[#EFE2D1] focus:text-[#AE6C4A]" onSelect={() => onNavigate('/account?section=credits')}>
          <CreditCard className="h-4 w-4" />
          Add Credits
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl px-3 py-2 text-[#4F4740] focus:bg-[#EFE2D1] focus:text-[#AE6C4A]" onSelect={() => onNavigate('/account?section=plan')}>
          <Settings className="h-4 w-4" />
          Manage Plan
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl px-3 py-2 text-[#4F4740] focus:bg-[#EFE2D1] focus:text-[#AE6C4A]" onSelect={() => onNavigate('/account?section=payments')}>
          <History className="h-4 w-4" />
          Payment History
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[#E1D3C3]" />
        <DropdownMenuItem
          className="rounded-xl px-3 py-2 text-[#8D4F37] focus:bg-[#F5E4DB] focus:text-[#8D4F37]"
          onSelect={() => {
            void onLogout();
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
