export const formatCurrency = (value: number, currency: string = 'ZAR'): string => {
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0
    }).format(value);
  } catch (error) {
    return `${currency} ${value.toFixed(2)}`;
  }
};

export const formatDate = (date: string | Date): string => {
  const instance = typeof date === 'string' ? new Date(date) : date;
  return instance.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export const formatTime = (date: string | Date): string => {
  const instance = typeof date === 'string' ? new Date(date) : date;
  return instance.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit'
  });
};
