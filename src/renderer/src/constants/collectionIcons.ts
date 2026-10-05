import type { Component } from 'vue'
import {
  ArchiveOutline,
  BookOutline,
  CameraOutline,
  ChatbubbleEllipsesOutline,
  CodeSlashOutline,
  FastFoodOutline,
  FolderOpenOutline,
  GameControllerOutline,
  HeartOutline,
  HeadsetOutline,
  ImagesOutline,
  LeafOutline,
  PencilOutline,
  RocketOutline,
  StarOutline
} from '@vicons/ionicons5'

/**
 * 文集预置图标（键 → 组件）：与侧栏菜单同一套 ionicons 矢量风格。
 * def.icon 的取值：预置键名（如 'Book'）、导入图标的 data URL（data: 开头）、
 * 或旧版的 emoji（渲染时回退为默认文件夹图标）。
 */
export const COLLECTION_ICON_PRESETS: Array<{ key: string; label: string; comp: Component }> = [
  { key: 'Book', label: '书籍', comp: BookOutline },
  { key: 'Pencil', label: '写作', comp: PencilOutline },
  { key: 'Folder', label: '文件夹', comp: FolderOpenOutline },
  { key: 'Archive', label: '归档', comp: ArchiveOutline },
  { key: 'Heart', label: '收藏', comp: HeartOutline },
  { key: 'Star', label: '星标', comp: StarOutline },
  { key: 'Camera', label: '摄影', comp: CameraOutline },
  { key: 'Images', label: '图片', comp: ImagesOutline },
  { key: 'Headset', label: '音乐', comp: HeadsetOutline },
  { key: 'Game', label: '游戏', comp: GameControllerOutline },
  { key: 'Code', label: '代码', comp: CodeSlashOutline },
  { key: 'Food', label: '美食', comp: FastFoodOutline },
  { key: 'Leaf', label: '生活', comp: LeafOutline },
  { key: 'Chat', label: '闲聊', comp: ChatbubbleEllipsesOutline },
  { key: 'Rocket', label: '计划', comp: RocketOutline }
]

/** 判断图标值是否为导入的图片（data URL） */
export function isImportedIcon(icon: string): boolean {
  return typeof icon === 'string' && icon.startsWith('data:')
}
