import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * A custom hook to listen for changes on a Supabase table.
 * @param table The name of the table to listen to (e.g. 'attendance')
 * @param filter The filter string (e.g. 'school_id=eq.123', 'student_id=eq.456')
 * @param onChangeCallback Function to call when an insert/update/delete happens. Will be debounced.
 */
export function useRealtimeTable(table: string, filter: string | undefined | null, onChangeCallback: () => void) {
  const supabase = createClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If table is empty, return early
    if (!table) return;

    const channelName = filter ? `realtime_${table}_${filter}` : `realtime_${table}_all`;
    const config: any = { event: '*', schema: 'public', table: table };
    if (filter) config.filter = filter;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        config,
        () => {
          // Debounce the callback to avoid rapid re-fetching
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            onChangeCallback();
          }, 300);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [table, filter, onChangeCallback, supabase]);
}
