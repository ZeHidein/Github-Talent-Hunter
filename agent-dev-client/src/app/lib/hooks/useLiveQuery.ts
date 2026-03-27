import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react';
import { invalidationRegistry } from '../invalidation-registry';

export function useLiveQuery<T>(
  topic: string,
  queryFn: () => Promise<T>,
  deps?: DependencyList,
): { data: T | undefined; isLoading: boolean; error: Error | null; refetch: () => void } {
  const [data, setData] = useState<T>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Stable ref for the latest queryFn to avoid stale closures in callbacks
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const refetch = useCallback(() => {
    setIsLoading(true);
    queryFnRef
      .current()
      .then((result) => {
        if (mountedRef.current) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });
  }, []);

  // Initial fetch + refetch on deps change
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? [topic]);

  // Subscribe to invalidation
  useEffect(() => {
    return invalidationRegistry.subscribe(topic, refetch);
  }, [topic, refetch]);

  return { data, isLoading, error, refetch };
}
