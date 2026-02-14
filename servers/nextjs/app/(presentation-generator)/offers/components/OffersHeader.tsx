"use client";

import React from "react";
import Link from "next/link";
import { LayoutDashboard, FileText, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";

const OffersHeader: React.FC = () => {
  const canChangeKeys = useSelector(
    (state: RootState) => state.userConfig.can_change_keys
  );
  const pathname = usePathname();

  return (
    <header className="bg-primary text-white">
      <div className="max-w-[1440px] w-[95%] mx-auto flex items-center justify-between h-14">
        <Link
          href="/offers"
          className="text-lg font-bold font-inter tracking-tight"
        >
          Presenton
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/dashboard"
            prefetch={false}
            className="flex items-center gap-2 px-3 py-2 text-white hover:bg-primary/80 rounded-md transition-colors outline-none"
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-sm font-medium font-inter">Dashboard</span>
          </Link>
          <Link
            href="/offers"
            prefetch={false}
            className={`flex items-center gap-2 px-3 py-2 text-white rounded-md transition-colors outline-none ${
              pathname.startsWith("/offers") ? "bg-primary/80" : "hover:bg-primary/80"
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-sm font-medium font-inter">Oferty</span>
          </Link>
          {canChangeKeys && (
            <Link
              href="/settings"
              prefetch={false}
              className="flex items-center gap-2 px-3 py-2 text-white hover:bg-primary/80 rounded-md transition-colors outline-none"
            >
              <Settings className="w-5 h-5" />
              <span className="text-sm font-medium font-inter">Settings</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default OffersHeader;
