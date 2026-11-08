"use client";

import clsx from "clsx";
import {
  Camera,
  CircleDot,
  KeyRound,
  Lock,
  LockKeyhole,
  LogOut,
  Palette,
  Settings,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON } from "@/constants/styles";
import { PasscodeSettingsSheet } from "@/features/auth/components/PasscodeSettingsSheet";
import {
  logoutAdminAction,
  logoutUserAction,
} from "@/features/auth/services/auth-actions";
import { lockNow } from "@/features/auth/services/passcode-actions";
import { buildLockUrl } from "@/features/auth/utils/lock-redirect";
import { AvatarSheet } from "@/features/avatar/components/AvatarSheet";
import { AccountColorSheet } from "@/features/chat/components/AccountColorSheet";
import { PushToggle } from "@/features/chat/components/PushToggle";
import { setPresenceHiddenAction } from "@/features/chat/services/presence-actions";
import type { ChatColorKey } from "@/features/chat/utils/chat-palette";
import { setThemeAction } from "@/services/theme-actions";
import { parseTheme, type Theme } from "@/utils/theme";

type Role = "user" | "admin";
type MenuId = "gear" | "avatar";

interface HeaderMenusProps {
  role: Role;
  // Admins only: whether a lock passcode is set (decides set vs change/off).
  hasPasscode?: boolean;
  // The signed-in person's name and saved photo (versioned URL or null).
  name: string;
  avatarUrl?: string | null;
  // Trainees only: link to their social profile, shown first in the avatar menu.
  profileHref?: string;
  // Admins only: the saved account colour (null = never picked) and whether
  // the online status is switched off.
  accountColor?: ChatColorKey | null;
  isPresenceHidden?: boolean;
}

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-fg transition active:bg-line";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Sáng" },
  { value: "dark", label: "Tối" },
  { value: "system", label: "Hệ thống" },
];

const PRESENCE_FAILED = "Không lưu được. Thử lại nhé.";
const UPDATING_MESSAGE = "Tính năng đang cập nhật";
const LOCK_FAILED = "Không khoá được. Thử lại nhé.";
const LOCK_NEEDS_PASSCODE = "Đặt mã khoá trước để khoá ứng dụng.";

const readCurrentTheme = () =>
  parseTheme(document.documentElement.dataset.theme);

const paintTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

// The gear (Giao diện, Thông báo đẩy; admins also Màu tài khoản, Trạng thái
// hoạt động, Mã khoá, Khoá ngay) and avatar (Ảnh đại diện, Đổi mật khẩu, Đăng xuất)
// menus of the app header, shared by the trainee and admin sites. One menu is
// open at a time; a tap outside or Esc closes it.
export const HeaderMenus = ({
  role,
  profileHref,
  hasPasscode = false,
  name,
  avatarUrl = null,
  accountColor = null,
  isPresenceHidden = false,
}: HeaderMenusProps) => {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [isPasscodeOpen, setIsPasscodeOpen] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [isColorOpen, setIsColorOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(isPresenceHidden);
  const [theme, setTheme] = useState<Theme>("system");
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<MenuId, HTMLButtonElement | null>>({
    gear: null,
    avatar: null,
  });
  const confirm = useConfirm();
  const router = useRouter();
  const [isLocking, startLocking] = useTransition();

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const trigger = triggerRefs.current[openMenu];
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        trigger?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // Keyboard and screen reader users land on the first item.
    panelRef.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled])')
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const toggle = (menu: MenuId) => {
    if (openMenu === menu) {
      setOpenMenu(null);
      return;
    }
    if (menu === "gear") {
      setTheme(readCurrentTheme());
    }
    setOpenMenu(menu);
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]',
      ),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;

    event.preventDefault();
    items[(index + step + items.length) % items.length]?.focus();
  };

  const chooseTheme = (next: Theme) => {
    // Paint now; the cookie makes the server render the same value next time.
    paintTheme(next);
    setTheme(next);
    startTransition(() => {
      void setThemeAction(next);
    });
  };

  // Saves at once; the switch flips first and goes back if the save fails.
  const togglePresence = () => {
    const next = !isHidden;

    setIsHidden(next);
    startTransition(async () => {
      try {
        const result = await setPresenceHiddenAction({ isHidden: next });

        if (result.status === "success") {
          toast.success(
            next
              ? "Đã tắt trạng thái hoạt động"
              : "Đã bật trạng thái hoạt động",
          );
          return;
        }
        setIsHidden(!next);
        toast.error(result.message ?? PRESENCE_FAILED);
      } catch {
        setIsHidden(!next);
        toast.error(PRESENCE_FAILED);
      }
    });
  };

  const logOut = async () => {
    setOpenMenu(null);
    const isConfirmed = await confirm({
      title: "Đăng xuất khỏi thiết bị này?",
      description: "Bạn cần đăng nhập lại để tiếp tục.",
      confirmLabel: "Đăng xuất",
      isDanger: true,
    });

    if (isConfirmed) {
      startTransition(() => {
        void (role === "admin" ? logoutAdminAction() : logoutUserAction());
      });
    }
  };

  // One tap locks the admin site right away (no confirm): the unlock cookie
  // is dropped on the server, then the lock screen opens for this page.
  const lockApp = () => {
    setOpenMenu(null);
    if (!hasPasscode) {
      toast.info(LOCK_NEEDS_PASSCODE);
      setIsPasscodeOpen(true);
      return;
    }
    startLocking(async () => {
      try {
        const result = await lockNow();

        if (result.status === "success") {
          router.replace(
            buildLockUrl(
              `${window.location.pathname}${window.location.search}`,
            ),
          );
          return;
        }
        toast.error(result.message ?? LOCK_FAILED);
      } catch {
        toast.error(LOCK_FAILED);
      }
    });
  };

  const renderTrigger = (menu: MenuId, label: string, icon: ReactNode) => (
    <button
      type="button"
      ref={(node) => {
        triggerRefs.current[menu] = node;
      }}
      onClick={() => toggle(menu)}
      className={clsx(
        ICON_BUTTON,
        openMenu === menu ? "bg-line text-fg" : "text-muted",
      )}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={openMenu === menu}
    >
      {icon}
    </button>
  );

  return (
    <div ref={rootRef} className="relative flex items-center">
      {renderTrigger("gear", "Cài đặt", <Settings className="size-5" />)}
      {renderTrigger(
        "avatar",
        "Tài khoản",
        <Avatar name={name} src={avatarUrl} className="size-8 text-xs" />,
      )}
      {openMenu && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={openMenu === "gear" ? "Cài đặt" : "Tài khoản"}
          onKeyDown={onPanelKeyDown}
          className="absolute top-full right-3 z-40 mt-1 w-[17rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.35)]"
        >
          {openMenu === "gear" ? (
            <>
              <div role="group" aria-label="Giao diện" className="px-1.5 py-1">
                <p className="px-1.5 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                  Giao diện
                </p>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-bg p-1">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === option.value}
                      onClick={() => chooseTheme(option.value)}
                      className={clsx(
                        "min-h-11 rounded-lg px-1 text-[13px] font-medium transition",
                        theme === option.value
                          ? "bg-surface text-fg shadow-sm ring-1 ring-line"
                          : "text-muted",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <hr className="my-1 border-line" />
              <PushToggle role={role} itemClassName={ITEM} />
              {role === "admin" && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    onClick={() => {
                      setOpenMenu(null);
                      setIsColorOpen(true);
                    }}
                  >
                    <Palette className="size-5 text-muted" aria-hidden />
                    Màu tài khoản
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!isHidden}
                    className={ITEM}
                    onClick={togglePresence}
                  >
                    <CircleDot className="size-5 text-muted" aria-hidden />
                    <span className="flex-1">Trạng thái hoạt động</span>
                    <span
                      aria-hidden
                      className={clsx(
                        "flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition",
                        isHidden ? "bg-line" : "bg-accent",
                      )}
                    >
                      <span
                        className={clsx(
                          "size-5 rounded-full bg-white shadow-sm transition-transform",
                          !isHidden && "translate-x-4",
                        )}
                      />
                    </span>
                    <span className="sr-only">{isHidden ? "Tắt" : "Bật"}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    onClick={() => {
                      setOpenMenu(null);
                      setIsPasscodeOpen(true);
                    }}
                  >
                    <LockKeyhole className="size-5 text-muted" aria-hidden />
                    Mã khoá
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    onClick={lockApp}
                    disabled={isLocking}
                  >
                    <Lock className="size-5 text-muted" aria-hidden />
                    Khoá ngay
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {profileHref && (
                <Link
                  href={profileHref}
                  role="menuitem"
                  className={ITEM}
                  onClick={() => setOpenMenu(null)}
                >
                  <UserRound className="size-5 text-muted" aria-hidden />
                  Trang cá nhân
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => {
                  setOpenMenu(null);
                  setIsAvatarOpen(true);
                }}
              >
                <Camera className="size-5 text-muted" aria-hidden />
                Ảnh đại diện
              </button>
              {role === "user" ? (
                <Link
                  href={ROUTES.ACCOUNT_PASSWORD}
                  role="menuitem"
                  className={ITEM}
                  onClick={() => setOpenMenu(null)}
                >
                  <KeyRound className="size-5 text-muted" aria-hidden />
                  Đổi mật khẩu
                </Link>
              ) : (
                // No admin password page yet (KAN-116 deviation): tell the
                // admin instead of hiding the item.
                <button
                  type="button"
                  role="menuitem"
                  className={ITEM}
                  onClick={() => {
                    setOpenMenu(null);
                    toast.info(UPDATING_MESSAGE);
                  }}
                >
                  <KeyRound className="size-5 text-muted" aria-hidden />
                  Đổi mật khẩu
                </button>
              )}
              <hr className="my-1 border-line" />
              <button
                type="button"
                role="menuitem"
                className={clsx(ITEM, "text-danger")}
                onClick={() => void logOut()}
              >
                <LogOut className="size-5" aria-hidden />
                Đăng xuất
              </button>
            </>
          )}
        </div>
      )}
      <AvatarSheet
        isOpen={isAvatarOpen}
        onOpenChange={setIsAvatarOpen}
        role={role}
        name={name}
        savedUrl={avatarUrl}
      />
      {role === "admin" && (
        <>
          <PasscodeSettingsSheet
            isOpen={isPasscodeOpen}
            onOpenChange={setIsPasscodeOpen}
            hasPasscode={hasPasscode}
          />
          <AccountColorSheet
            isOpen={isColorOpen}
            onOpenChange={setIsColorOpen}
            savedColor={accountColor}
          />
        </>
      )}
    </div>
  );
};
