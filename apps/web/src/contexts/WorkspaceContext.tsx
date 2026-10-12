import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './AuthContext';

export interface WorkspaceBranch {
  id: string;
  name: string;
  code?: string;
  city?: string;
  isMain: boolean;
  isActive: boolean;
}

export interface WorkspaceWarehouse {
  id: string;
  name: string;
  code?: string;
  branchId: string | null;
  isMain: boolean;
  isActive: boolean;
}

export interface WorkspaceData {
  isOwner: boolean;
  accessAll: boolean;
  activeBranchId: string | null;
  activeWarehouseId: string | null;
  activeBranchName: string | null;
  activeWarehouseName: string | null;
  mainBranchId: string | null;
  defaultBranchId: string | null;
  defaultWarehouseId: string | null;
  effectiveBranchIds: string[] | null;
  effectiveWarehouseIds: string[] | null;
  branches: WorkspaceBranch[];
  warehouses: WorkspaceWarehouse[];
  showSelector: boolean;
  features: { branches: boolean; warehouses: boolean };
}

interface WorkspaceContextValue {
  workspace: WorkspaceData | null;
  loading: boolean;
  /** بيتغير مع كل تغيير لفرع/مخزن العمل — الصفحات بتستخدمه عشان تعيد تحميل بياناتها. */
  workspaceKey: string;
  reload: () => Promise<void>;
  setWorkspace: (branchId: string | null, warehouseId: string | null) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  loading: true,
  workspaceKey: 'none',
  reload: async () => {},
  setWorkspace: async () => {},
});

export const useWorkspace = () => useContext(WorkspaceContext);

/** المخازن اللي بتظهر مع فرع معيّن (كل مخزن تابع لفرع؛ اللي من غير فرع بيظهر مع الكل احتياطياً). */
export function warehousesForBranch(
  warehouses: WorkspaceWarehouse[],
  branchId: string | null
): WorkspaceWarehouse[] {
  if (!branchId) return warehouses;
  return warehouses.filter((w) => !w.branchId || w.branchId === branchId);
}

/** وصف مختصر لفرع/مخزن العمل الحالي (للهيدر والصفحات). */
export function describeWorkspace(ws: WorkspaceData | null): string {
  if (!ws) return '';
  const branch =
    ws.activeBranchName || (ws.branches.length > 1 ? 'كل الفروع' : ws.branches[0]?.name || '');
  const warehouse =
    ws.activeWarehouseName ||
    (ws.activeBranchId
      ? 'كل مخازن الفرع'
      : ws.warehouses.length > 1
        ? 'كل المخازن'
        : ws.warehouses[0]?.name || '');
  return [branch, warehouse].filter(Boolean).join(' — ');
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [workspace, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.get('/workspace');
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setWorkspace = async (branchId: string | null, warehouseId: string | null) => {
    const res = await api.put('/workspace', { branchId, warehouseId });
    setData(res.data.data);
  };

  const workspaceKey = workspace
    ? `${workspace.activeBranchId || 'all'}|${workspace.activeWarehouseId || 'all'}`
    : 'none';

  return (
    <WorkspaceContext.Provider value={{ workspace, loading, workspaceKey, reload, setWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
