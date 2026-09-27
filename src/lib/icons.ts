import type { Component } from 'svelte';
// Lucide icons used across Planora (ISC licence). Import each icon on its own so
// only these ship in the bundle; add new names here and use them via <AppIcon name>.
import AmphoraIcon from '@lucide/svelte/icons/amphora';
import AppWindowIcon from '@lucide/svelte/icons/app-window';
import ArchiveIcon from '@lucide/svelte/icons/archive';
import ArmchairIcon from '@lucide/svelte/icons/armchair';
import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
import BathIcon from '@lucide/svelte/icons/bath';
import BedIcon from '@lucide/svelte/icons/bed';
import BedDoubleIcon from '@lucide/svelte/icons/bed-double';
import BedSingleIcon from '@lucide/svelte/icons/bed-single';
import BellIcon from '@lucide/svelte/icons/bell';
import BikeIcon from '@lucide/svelte/icons/bike';
import BirdIcon from '@lucide/svelte/icons/bird';
import BoxIcon from '@lucide/svelte/icons/box';
import BrickWallIcon from '@lucide/svelte/icons/brick-wall';
import BuildingIcon from '@lucide/svelte/icons/building';
import CameraIcon from '@lucide/svelte/icons/camera';
import CarIcon from '@lucide/svelte/icons/car';
import CarFrontIcon from '@lucide/svelte/icons/car-front';
import CheckIcon from '@lucide/svelte/icons/check';
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
import CircleIcon from '@lucide/svelte/icons/circle';
import CircleXIcon from '@lucide/svelte/icons/circle-x';
import CitrusIcon from '@lucide/svelte/icons/citrus';
import ClipboardIcon from '@lucide/svelte/icons/clipboard';
import ClockIcon from '@lucide/svelte/icons/clock';
import CoffeeIcon from '@lucide/svelte/icons/coffee';
import Columns3Icon from '@lucide/svelte/icons/columns-3';
import CommandIcon from '@lucide/svelte/icons/command';
import ConstructionIcon from '@lucide/svelte/icons/construction';
import CookingPotIcon from '@lucide/svelte/icons/cooking-pot';
import CopyIcon from '@lucide/svelte/icons/copy';
import CrosshairIcon from '@lucide/svelte/icons/crosshair';
import CylinderIcon from '@lucide/svelte/icons/cylinder';
import DoorClosedIcon from '@lucide/svelte/icons/door-closed';
import DoorOpenIcon from '@lucide/svelte/icons/door-open';
import DownloadIcon from '@lucide/svelte/icons/download';
import DropletIcon from '@lucide/svelte/icons/droplet';
import DropletsIcon from '@lucide/svelte/icons/droplets';
import EyeIcon from '@lucide/svelte/icons/eye';
import EyeOffIcon from '@lucide/svelte/icons/eye-off';
import FanIcon from '@lucide/svelte/icons/fan';
import FenceIcon from '@lucide/svelte/icons/fence';
import FileDownIcon from '@lucide/svelte/icons/file-down';
import FileUpIcon from '@lucide/svelte/icons/file-up';
import FlameIcon from '@lucide/svelte/icons/flame';
import FlashlightIcon from '@lucide/svelte/icons/flashlight';
import FlowerIcon from '@lucide/svelte/icons/flower';
import Flower2Icon from '@lucide/svelte/icons/flower-2';
import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
import FoldersIcon from '@lucide/svelte/icons/folders';
import FootprintsIcon from '@lucide/svelte/icons/footprints';
import FuelIcon from '@lucide/svelte/icons/fuel';
import GhostIcon from '@lucide/svelte/icons/ghost';
import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
import Grid2x2Icon from '@lucide/svelte/icons/grid-2x2';
import GroupIcon from '@lucide/svelte/icons/group';
import HeartIcon from '@lucide/svelte/icons/heart';
import HeaterIcon from '@lucide/svelte/icons/heater';
import HouseIcon from '@lucide/svelte/icons/house';
import HousePlusIcon from '@lucide/svelte/icons/house-plus';
import ImageIcon from '@lucide/svelte/icons/image';
import KeyboardIcon from '@lucide/svelte/icons/keyboard';
import LampIcon from '@lucide/svelte/icons/lamp';
import LampCeilingIcon from '@lucide/svelte/icons/lamp-ceiling';
import LampDeskIcon from '@lucide/svelte/icons/lamp-desk';
import LampFloorIcon from '@lucide/svelte/icons/lamp-floor';
import LandmarkIcon from '@lucide/svelte/icons/landmark';
import LaptopIcon from '@lucide/svelte/icons/laptop';
import LayersIcon from '@lucide/svelte/icons/layers';
import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
import LeafIcon from '@lucide/svelte/icons/leaf';
import LibraryBigIcon from '@lucide/svelte/icons/library-big';
import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import LockIcon from '@lucide/svelte/icons/lock';
import LockOpenIcon from '@lucide/svelte/icons/lock-open';
import MagnetIcon from '@lucide/svelte/icons/magnet';
import MailboxIcon from '@lucide/svelte/icons/mailbox';
import MapIcon from '@lucide/svelte/icons/map';
import MinusIcon from '@lucide/svelte/icons/minus';
import MonitorIcon from '@lucide/svelte/icons/monitor';
import MoonIcon from '@lucide/svelte/icons/moon';
import MountainIcon from '@lucide/svelte/icons/mountain';
import MousePointer2Icon from '@lucide/svelte/icons/mouse-pointer-2';
import MoveIcon from '@lucide/svelte/icons/move';
import MoveHorizontalIcon from '@lucide/svelte/icons/move-horizontal';
import MoveVerticalIcon from '@lucide/svelte/icons/move-vertical';
import PackageIcon from '@lucide/svelte/icons/package';
import PaintBucketIcon from '@lucide/svelte/icons/paint-bucket';
import PaletteIcon from '@lucide/svelte/icons/palette';
import PencilIcon from '@lucide/svelte/icons/pencil';
import PersonStandingIcon from '@lucide/svelte/icons/person-standing';
import PlugIcon from '@lucide/svelte/icons/plug';
import PlusIcon from '@lucide/svelte/icons/plus';
import PrinterIcon from '@lucide/svelte/icons/printer';
import RectangleVerticalIcon from '@lucide/svelte/icons/rectangle-vertical';
import Redo2Icon from '@lucide/svelte/icons/redo-2';
import RefrigeratorIcon from '@lucide/svelte/icons/refrigerator';
import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
import Rows3Icon from '@lucide/svelte/icons/rows-3';
import RulerIcon from '@lucide/svelte/icons/ruler';
import SaveIcon from '@lucide/svelte/icons/save';
import ScissorsIcon from '@lucide/svelte/icons/scissors';
import SearchIcon from '@lucide/svelte/icons/search';
import SettingsIcon from '@lucide/svelte/icons/settings';
import ShirtIcon from '@lucide/svelte/icons/shirt';
import ShoppingBasketIcon from '@lucide/svelte/icons/shopping-basket';
import ShowerHeadIcon from '@lucide/svelte/icons/shower-head';
import SignpostIcon from '@lucide/svelte/icons/signpost';
import SofaIcon from '@lucide/svelte/icons/sofa';
import SparklesIcon from '@lucide/svelte/icons/sparkles';
import SpeakerIcon from '@lucide/svelte/icons/speaker';
import SproutIcon from '@lucide/svelte/icons/sprout';
import SquareIcon from '@lucide/svelte/icons/square';
import SunIcon from '@lucide/svelte/icons/sun';
import SunDimIcon from '@lucide/svelte/icons/sun-dim';
import SunriseIcon from '@lucide/svelte/icons/sunrise';
import SunsetIcon from '@lucide/svelte/icons/sunset';
import TableIcon from '@lucide/svelte/icons/table';
import TagIcon from '@lucide/svelte/icons/tag';
import TentIcon from '@lucide/svelte/icons/tent';
import ToggleLeftIcon from '@lucide/svelte/icons/toggle-left';
import ToiletIcon from '@lucide/svelte/icons/toilet';
import ToolboxIcon from '@lucide/svelte/icons/toolbox';
import TrashIcon from '@lucide/svelte/icons/trash';
import TreeDeciduousIcon from '@lucide/svelte/icons/tree-deciduous';
import TreePalmIcon from '@lucide/svelte/icons/tree-palm';
import TreePineIcon from '@lucide/svelte/icons/tree-pine';
import TreesIcon from '@lucide/svelte/icons/trees';
import TriangleRightIcon from '@lucide/svelte/icons/triangle-right';
import TvIcon from '@lucide/svelte/icons/tv';
import TypeIcon from '@lucide/svelte/icons/type';
import UmbrellaIcon from '@lucide/svelte/icons/umbrella';
import Undo2Icon from '@lucide/svelte/icons/undo-2';
import UngroupIcon from '@lucide/svelte/icons/ungroup';
import UploadIcon from '@lucide/svelte/icons/upload';
import UsersIcon from '@lucide/svelte/icons/users';
import UtensilsIcon from '@lucide/svelte/icons/utensils';
import WashingMachineIcon from '@lucide/svelte/icons/washing-machine';
import WavesLadderIcon from '@lucide/svelte/icons/waves-ladder';
import WheatIcon from '@lucide/svelte/icons/wheat';
import WrenchIcon from '@lucide/svelte/icons/wrench';
import XIcon from '@lucide/svelte/icons/x';
import ZapIcon from '@lucide/svelte/icons/zap';
import ZoomInIcon from '@lucide/svelte/icons/zoom-in';

export const icons = {
  'amphora': AmphoraIcon,
  'app-window': AppWindowIcon,
  'archive': ArchiveIcon,
  'armchair': ArmchairIcon,
  'arrow-down-to-line': ArrowDownToLineIcon,
  'bath': BathIcon,
  'bed': BedIcon,
  'bed-double': BedDoubleIcon,
  'bed-single': BedSingleIcon,
  'bell': BellIcon,
  'bike': BikeIcon,
  'bird': BirdIcon,
  'box': BoxIcon,
  'brick-wall': BrickWallIcon,
  'building': BuildingIcon,
  'camera': CameraIcon,
  'car': CarIcon,
  'car-front': CarFrontIcon,
  'check': CheckIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-right': ChevronRightIcon,
  'circle': CircleIcon,
  'circle-x': CircleXIcon,
  'citrus': CitrusIcon,
  'clipboard': ClipboardIcon,
  'clock': ClockIcon,
  'coffee': CoffeeIcon,
  'columns-3': Columns3Icon,
  'command': CommandIcon,
  'construction': ConstructionIcon,
  'cooking-pot': CookingPotIcon,
  'copy': CopyIcon,
  'crosshair': CrosshairIcon,
  'cylinder': CylinderIcon,
  'door-closed': DoorClosedIcon,
  'door-open': DoorOpenIcon,
  'download': DownloadIcon,
  'droplet': DropletIcon,
  'droplets': DropletsIcon,
  'eye': EyeIcon,
  'eye-off': EyeOffIcon,
  'fan': FanIcon,
  'fence': FenceIcon,
  'file-down': FileDownIcon,
  'file-up': FileUpIcon,
  'flame': FlameIcon,
  'flashlight': FlashlightIcon,
  'flower': FlowerIcon,
  'flower-2': Flower2Icon,
  'folder-open': FolderOpenIcon,
  'folders': FoldersIcon,
  'footprints': FootprintsIcon,
  'fuel': FuelIcon,
  'ghost': GhostIcon,
  'graduation-cap': GraduationCapIcon,
  'grid-2x2': Grid2x2Icon,
  'group': GroupIcon,
  'heart': HeartIcon,
  'heater': HeaterIcon,
  'house': HouseIcon,
  'house-plus': HousePlusIcon,
  'image': ImageIcon,
  'keyboard': KeyboardIcon,
  'lamp': LampIcon,
  'lamp-ceiling': LampCeilingIcon,
  'lamp-desk': LampDeskIcon,
  'lamp-floor': LampFloorIcon,
  'landmark': LandmarkIcon,
  'laptop': LaptopIcon,
  'layers': LayersIcon,
  'layout-grid': LayoutGridIcon,
  'leaf': LeafIcon,
  'library-big': LibraryBigIcon,
  'lightbulb': LightbulbIcon,
  'loader-circle': LoaderCircleIcon,
  'lock': LockIcon,
  'lock-open': LockOpenIcon,
  'magnet': MagnetIcon,
  'mailbox': MailboxIcon,
  'map': MapIcon,
  'minus': MinusIcon,
  'monitor': MonitorIcon,
  'moon': MoonIcon,
  'mountain': MountainIcon,
  'mouse-pointer-2': MousePointer2Icon,
  'move': MoveIcon,
  'move-horizontal': MoveHorizontalIcon,
  'move-vertical': MoveVerticalIcon,
  'package': PackageIcon,
  'paint-bucket': PaintBucketIcon,
  'palette': PaletteIcon,
  'pencil': PencilIcon,
  'person-standing': PersonStandingIcon,
  'plug': PlugIcon,
  'plus': PlusIcon,
  'printer': PrinterIcon,
  'rectangle-vertical': RectangleVerticalIcon,
  'redo-2': Redo2Icon,
  'refrigerator': RefrigeratorIcon,
  'rotate-cw': RotateCwIcon,
  'rows-3': Rows3Icon,
  'ruler': RulerIcon,
  'save': SaveIcon,
  'scissors': ScissorsIcon,
  'search': SearchIcon,
  'settings': SettingsIcon,
  'shirt': ShirtIcon,
  'shopping-basket': ShoppingBasketIcon,
  'shower-head': ShowerHeadIcon,
  'signpost': SignpostIcon,
  'sofa': SofaIcon,
  'sparkles': SparklesIcon,
  'speaker': SpeakerIcon,
  'sprout': SproutIcon,
  'square': SquareIcon,
  'sun': SunIcon,
  'sun-dim': SunDimIcon,
  'sunrise': SunriseIcon,
  'sunset': SunsetIcon,
  'table': TableIcon,
  'tag': TagIcon,
  'tent': TentIcon,
  'toggle-left': ToggleLeftIcon,
  'toilet': ToiletIcon,
  'toolbox': ToolboxIcon,
  'trash': TrashIcon,
  'tree-deciduous': TreeDeciduousIcon,
  'tree-palm': TreePalmIcon,
  'tree-pine': TreePineIcon,
  'trees': TreesIcon,
  'triangle-right': TriangleRightIcon,
  'tv': TvIcon,
  'type': TypeIcon,
  'umbrella': UmbrellaIcon,
  'undo-2': Undo2Icon,
  'ungroup': UngroupIcon,
  'upload': UploadIcon,
  'users': UsersIcon,
  'utensils': UtensilsIcon,
  'washing-machine': WashingMachineIcon,
  'waves-ladder': WavesLadderIcon,
  'wheat': WheatIcon,
  'wrench': WrenchIcon,
  'x': XIcon,
  'zap': ZapIcon,
  'zoom-in': ZoomInIcon,
} as const satisfies Record<string, Component<any>>;

export type IconName = keyof typeof icons;

/** Resolve a stored icon name (e.g. from the furniture catalog); unknown names fall back to a box. */
export function iconFor(name: string | undefined): Component<any> {
  return (name && (icons as Record<string, Component<any>>)[name]) || icons.box;
}
