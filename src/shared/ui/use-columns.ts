import { useEffect, useState } from 'react';

// Tracks terminal width live. Subscribes to stdout 'resize' directly so
// consumers can make layout decisions (hide/show items) without threading
// resizeEpoch through every component.
export function useColumns(): number {
  const [cols, setCols] = useState<number>(() => process.stdout.columns ?? 80);
  useEffect(() => {
    const onResize = () => setCols(process.stdout.columns ?? 80);
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);
  return cols;
}

export function useRows(): number {
  const [rows, setRows] = useState<number>(() => process.stdout.rows ?? 24);
  useEffect(() => {
    const onResize = () => setRows(process.stdout.rows ?? 24);
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);
  return rows;
}
