"use client";

import clsx from "clsx";
import { KeyRound, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON } from "@/constants/styles";
import {
  logoutAdminAction,
  logoutUserAction,
} from "@/features/auth/services/auth-actions";
import { PushToggle } from "@/features/chat/components/PushToggle";
import { setThemeAction } from "@/services/theme-actions";
import { parseTheme, type Theme } from "@/utils/theme";

type Role = "user" | "admin";
type MenuId = "gear" | "avatar";

interface HeaderMenusProps {
  role: Role;
}

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-fg transition active:bg-line";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Sáng" },
  { value: "dark", label: "Tối" },
  { value: "system", label: "Hệ thống" },
];

const UPDATING_MESSAGE = "Tính năng đang cập nhật";

const readCurrentTheme = () =>
  parseTheme(document.documentElement.dataset.theme);

const paintTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

// The gear (Giao diện, Thông báo đẩy) and avatar (Đổi mật khẩu, Đăng xuất)
// menus of the app header, shared by the trainee and admin sites. One menu is
// open at a time; a tap outside or Esc closes it.
export const HeaderMenus = ({ role }: HeaderMenusProps) => {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [theme, setTheme] = useState<Theme>("system");
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<MenuId, HTMLButtonElement | null>>({
    gear: null,
    avatar: null,
  });
  const confirm = useConfirm();

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
        <span className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-accent">
          <User className="size-[18px]" aria-hidden />
        </span>,
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
            </>
          ) : (
            <>
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
    </div>
  );
};
