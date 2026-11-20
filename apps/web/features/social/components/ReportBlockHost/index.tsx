"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

import { BlockUserSheet } from "@/features/restrictions/components/BlockUserSheet";

const ReportBlockContext = createContext<(userId: number) => void>(() => {});

// Opens the block sheet for a reported trainee. The sheet lives here, above the
// report list, because resolving a report removes its row (and anything the
// row owns) as soon as the page refreshes.
export const useReportBlock = () => useContext(ReportBlockContext);

export const ReportBlockHost = ({ children }: { children: ReactNode }) => {
  const [userId, setUserId] = useState<number | null>(null);

  return (
    <ReportBlockContext.Provider value={setUserId}>
      {children}
      {userId !== null && (
        <BlockUserSheet
          userId={userId}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setUserId(null);
            }
          }}
        />
      )}
    </ReportBlockContext.Provider>
  );
};
