import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

/**
 * مخازن نطاق العمل الحالي اللي ينفع نبيع/نشتري/نحوّل منها (النشطة بس).
 * لو اختار مخزن عمل محدد هيرجع المخزن ده لوحده.
 */
export function workingWarehouses(ws: WorkspaceData | null): WorkspaceWarehouse[] {
  if (!ws) return [];
  const active = ws.warehouses.filter((w) => w.isActive !== false);
  const ids = ws.effectiveWarehouseIds;
  return ids ? active.filter((w) => ids.includes(w.id)) : active;
}

/** فروع نطاق العمل الحالي (النشطة بس). */
export function workingBranches(ws: WorkspaceData | null): WorkspaceBranch[] {
  if (!ws) return [];
  const active = ws.branches.filter((b) => b.isActive !== false);
  const ids = ws.effectiveBranchIds;
  return ids ? active.filter((b) => ids.includes(b.id)) : active;
}

type Located = { id: string; isMain?: boolean };

function pickDefault<T extends Located>(
  list: T[],
  preferred: Array<string | null | undefined>
): string | null {
  if (!list.length) return null;
  for (const id of preferred) {
    if (id && list.some((x) => x.id === id)) return id;
  }
  return (list.find((x) => x.isMain) || list[0]).id;
}

/** المخزن الافتراضي: مخزن العمل ← المخزن الافتراضي للمستخدم ← الرئيسي ← أول مخزن. */
export function defaultWorkingWarehouseId(ws: WorkspaceData | null): string | null {
  return pickDefault(workingWarehouses(ws), [ws?.activeWarehouseId, ws?.defaultWarehouseId]);
}

/** الفرع الافتراضي: فرع العمل ← فرع مخزن العمل ← الفرع الافتراضي للمستخدم ← الرئيسي ← أول فرع. */
export function defaultWorkingBranchId(ws: WorkspaceData | null): string | null {
  const activeWarehouse = ws?.warehouses.find((w) => w.id === ws.activeWarehouseId);
  return pickDefault(workingBranches(ws), [
    ws?.activeBranchId,
    activeWarehouse?.branchId,
    ws?.defaultBranchId,
  ]);
}

/** يرجّع القيمة الحالية لو لسه موجودة في القايمة، وإلا الافتراضي. */
export function keepIfValid(
  list: Array<{ id: string }>,
  current: string | null | undefined,
  fallback: string | null
): string {
  if (current && list.some((x) => x.id === current)) return current;
  return fallback || '';
}

/**
 * مخازن العمل للصفحات اللي بتبيع/تشتري/تحوّل.
 * لو بيانات فرع العمل مش متاحة (خطأ شبكة مثلاً) بنرجع لقايمة /warehouses كاحتياطي.
 */
export function useWorkingWarehouses() {
  const { workspace, loading } = useWorkspace();
  const [fallback, setFallback] = useState<WorkspaceWarehouse[] | null>(null);

  useEffect(() => {
    if (loading || workspace || fallback) return;
    let cancelled = false;
    api
      .get('/warehouses')
      .then((res) => {
        if (cancelled) return;
        const rows: WorkspaceWarehouse[] = (res.data.data || []).filter(
          (w: WorkspaceWarehouse) => w.isActive !== false
        );
        setFallback(rows);
      })
      .catch(() => {
        if (!cancelled) setFallback([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, workspace, fallback]);

  return useMemo(() => {
    if (workspace) {
      return {
        ready: true,
        warehouses: workingWarehouses(workspace),
        defaultWarehouseId: defaultWorkingWarehouseId(workspace),
      };
    }
    const list = fallback || [];
    return {
      ready: !loading && fallback !== null,
      warehouses: list,
      defaultWarehouseId: pickDefault(list, []),
    };
  }, [workspace, fallback, loading]);
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
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id || null;
  const [workspace, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const lastJson = useRef<string>('');
  const lastFetch = useRef<number>(0);

  const apply = useCallback((data: WorkspaceData | null) => {
    const json = JSON.stringify(data);
    // مانحدّثش الحالة لو مفيش تغيير، عشان الصفحات المفتوحة ماتتعملهاش إعادة تحميل.
    if (json === lastJson.current) return;
    lastJson.current = json;
    setData(data);
  }, []);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      apply(null);
      setLoading(false);
      return;
    }
    lastFetch.current = Date.now();
    try {
      const res = await api.get('/workspace');
      apply(res.data.data);
    } catch {
      // في حالة خطأ مؤقت بنسيب آخر بيانات سليمة زي ما هي.
    } finally {
      setLoading(false);
    }
    // userId: أي تبديل حساب لازم يجيب بيانات فرع العمل من جديد.
  }, [isAuthenticated, userId, apply]);

  useEffect(() => {
    lastJson.current = '';
    setData(null);
    setLoading(true);
    reload();
  }, [reload]);

  // مزامنة هادية لما المستخدم يرجع للتاب (لو غيّر فرع العمل من تاب/جهاز تاني أو
  // صاحب الحساب غيّر صلاحياته)، بحد أقصى مرة كل 30 ثانية.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastFetch.current < 30_000) return;
      reload();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isAuthenticated, reload]);

  const setWorkspace = async (branchId: string | null, warehouseId: string | null) => {
    const res = await api.put('/workspace', { branchId, warehouseId });
    lastFetch.current = Date.now();
    apply(res.data.data);
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
