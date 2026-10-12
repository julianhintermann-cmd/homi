/**
 * Homi design system (ARCHITECTURE §8). Visual spec: design/FIDELITY.md.
 * Styles live in styles/glass.css (Liquid Glass) and styles/components.css.
 */
export { Icon, type IconName, type IconProps } from '@/icons/Icon';
export {
  Avatar,
  AvatarStack,
  type AvatarProps,
  type AvatarStackPerson,
  type AvatarStackProps,
  type AvatarTone,
} from './Avatar';
export { avatarTone, initialOf } from './avatarTone';
export { Button, Spinner, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export {
  ChatBubble,
  ChatReadReceipt,
  ChatTimestamp,
  UnreadDivider,
  type ChatBubbleDirection,
  type ChatBubbleProps,
} from './ChatBubble';
export { ChatComposer, COMPOSER_HEIGHT_VAR, type ChatComposerProps } from './ChatComposer';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Chip, ChipRow, type ChipProps, type ChipRowProps } from './Chip';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
export { ContextMenu, type AnchorRect, type ContextMenuItem, type ContextMenuProps } from './ContextMenu';
export { ConversationRow, type ConversationRowProps } from './ConversationRow';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { FormCard, FormRow, type FormCardProps, type FormRowProps } from './FormCard';
export { GlassButton, type GlassButtonProps, type GlassButtonSize, type GlassButtonTone } from './GlassButton';
export { GlassToolbar, GlassToolbarItem, type GlassToolbarItemProps, type GlassToolbarProps } from './GlassToolbar';
export {
  Card,
  GroupedList,
  SectionHeader,
  type CardProps,
  type GroupedListProps,
  type SectionHeaderProps,
} from './GroupedList';
export {
  BottomSheetOption,
  HomiBottomSheet,
  SheetHeader,
  type BottomSheetOptionProps,
  type BottomSheetVariant,
  type HomiBottomSheetProps,
  type SheetHeaderProps,
} from './HomiBottomSheet';
export { HomiSearchField, type HomiSearchFieldProps } from './HomiSearchField';
export { HomiTabBar, type HomiTabBarItem, type HomiTabBarProps } from './HomiTabBar';
export { ImageUploadArea, type ImageUploadAreaProps, type ImageUploadState } from './ImageUploadArea';
export { InlineHeader, type InlineHeaderContact, type InlineHeaderProps } from './InlineHeader';
export { InventoryItemRow, type InventoryItemRowProps } from './InventoryItemRow';
export { LargeTitleHeader, type LargeTitleHeaderProps } from './LargeTitleHeader';
export { ListRow, type ListRowProps, type ListRowVariant } from './ListRow';
export { OfflineBanner, type OfflineBannerProps } from './OfflineBanner';
export { Portal } from './Portal';
export { PriceField, type PriceFieldProps } from './PriceField';
export { finalizePrice, sanitizePriceInput } from './priceInput';
export { ProductImage, type ProductImageProps, type ProductImageSize } from './ProductImage';
export { ProfileButton, type ProfileButtonProps } from './ProfileButton';
export { QuantityStepper, type QuantityStepperProps, type QuantityStepperSize } from './QuantityStepper';
export { Screen, ScrollEdge, type ScreenEdges, type ScreenProps, type ScrollEdgeProps } from './Screen';
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './SegmentedControl';
export { SelectRow, type SelectOption, type SelectRowProps } from './SelectRow';
export { SharedItemCard, type SharedItemCardProps } from './SharedItemCard';
export { useSheet, type SheetContextValue } from './sheetContext';
export { ShoppingItemRow, type ShoppingItemRowProps } from './ShoppingItemRow';
export { Skeleton, SkeletonList, type SkeletonListProps, type SkeletonProps } from './Skeleton';
export { Stat, type StatProps } from './Stat';
export { SwipeableRow, type SwipeAction, type SwipeableRowProps } from './SwipeableRow';
export { TextField, type TextFieldProps } from './TextField';
export { Toast, ToastHost, type ToastProps } from './Toast';
export { dismissToast, showToast, useToastStore, type ToastOptions, type ToastTone } from './toastStore';
export { useLongPress, type LongPressDetail, type LongPressOptions } from './useLongPress';
export { useRowMenu } from './useRowMenu';
