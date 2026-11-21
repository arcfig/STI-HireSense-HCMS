import Swal from 'sweetalert2';

function getThemeColors() {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-bs-theme') === 'dark';

  return {
    background: isDark ? '#1e1e1e' : '#ffffff',
    color: isDark ? '#f8f9fa' : '#1e293b'
  };
}

/**
 * Displays a custom theme-aware SweetAlert2 confirmation dialog.
 * Replaces native browser `window.confirm(...)` across HireSense.
 */
export async function confirmAction({
  title = 'Are you sure?',
  text = '',
  icon = 'warning',
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  confirmButtonColor = '#08612f',
  cancelButtonColor = '#64748b'
} = {}) {
  const theme = getThemeColors();
  const result = await Swal.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor,
    cancelButtonColor,
    reverseButtons: true,
    focusCancel: icon === 'warning' || icon === 'error',
    ...theme
  });

  return Boolean(result.isConfirmed);
}

/**
 * Displays a custom theme-aware SweetAlert2 notice/alert dialog.
 * Replaces native browser `window.alert(...)` across HireSense.
 */
export async function showAlert({
  title = 'Notice',
  text = '',
  icon = 'info',
  confirmButtonText = 'OK',
  confirmButtonColor = '#08612f',
  showCancelButton = false,
  cancelButtonText = 'Cancel',
  cancelButtonColor = '#64748b'
} = {}) {
  const theme = getThemeColors();
  return Swal.fire({
    icon,
    title,
    text,
    showCancelButton,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor,
    cancelButtonColor,
    reverseButtons: true,
    ...theme
  });
}
