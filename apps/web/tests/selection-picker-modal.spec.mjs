import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  renderSelectionPickerModal,
  syncSelectionPickerSelection,
  syncSelectionPickerTab,
} from "../src/features/production-workbench/selection-picker-modal.js";

describe("selection picker modal", () => {
  it("renders isolated tabs, selectable items, and confirmation actions", () => {
    const html = renderSelectionPickerModal({
      show: true,
      id: "asset-picker",
      title: "选择资产",
      tabs: [
        { id: "official", label: "官方", count: 1 },
        { id: "personal", label: "个人", count: 1 },
      ],
      activeTab: "official",
      selectedId: "asset-1",
      items: [
        { id: "asset-1", group: "official", label: "官方资产", description: "说明", meta: "免费", previewUrls: ["/one.png", "/two.png"] },
        { id: "asset-2", group: "personal", label: "个人资产" },
      ],
      closeAction: "close-asset-picker",
      tabAction: "set-asset-picker-tab",
      selectAction: "select-asset-picker-item",
      confirmAction: "confirm-asset-picker",
      secondaryConfirmAction: "confirm-and-create",
      secondaryConfirmLabel: "引用并创建",
    });

    assert.match(html, /selection-picker-layer/);
    assert.match(html, /role="dialog"/);
    assert.match(html, /data-action="close-asset-picker"/);
    assert.match(html, /data-action="set-asset-picker-tab"/);
    assert.match(html, /data-action="select-asset-picker-item"/);
    assert.match(html, /data-action="confirm-asset-picker"/);
    assert.match(html, /selection-picker-secondary-confirm/);
    assert.match(html, /data-action="confirm-and-create"/);
    assert.match(html, /selection-picker-item-gallery/);
    assert.match(html, /src="\/one\.png"/);
    assert.match(html, /src="\/two\.png"/);
    assert.match(html, /官方资产/);
    assert.doesNotMatch(html, /个人资产/);
  });

  it("disables confirmation and renders the configured empty state without a selection", () => {
    const html = renderSelectionPickerModal({
      show: true,
      title: "选择技能",
      tabs: [{ id: "personal", label: "个人", count: 0 }],
      activeTab: "personal",
      emptyLabel: "暂无个人技能",
    });

    assert.match(html, /暂无个人技能/);
    assert.match(html, /selection-picker-confirm[^>]*disabled/);
  });

  it("filters a source category before applying its content tab", () => {
    const html = renderSelectionPickerModal({
      show: true,
      id: "material-picker",
      title: "选择素材引用",
      sourceTabs: [
        { id: "official", label: "官方素材库" },
        { id: "team", label: "团队素材库" },
      ],
      activeSource: "team",
      sourceAction: "set-material-source",
      tabs: [{ id: "character", label: "人物", count: 1 }],
      activeTab: "character",
      items: [
        { id: "official-character", sourceGroup: "official", group: "character", label: "官方人物" },
        { id: "team-character", sourceGroup: "team", group: "character", label: "团队人物" },
      ],
    });

    assert.match(html, /selection-picker-modal has-source-tabs/);
    assert.match(html, /data-action="set-material-source"/);
    assert.match(html, /data-picker-source="team"/);
    assert.match(html, /团队人物/);
    assert.doesNotMatch(html, /官方人物/);
  });

  it("updates selection in place without rebuilding the modal", () => {
    const first = createPickerItem("first");
    const second = createPickerItem("second");
    const confirm = { disabled: true };
    const secondaryConfirm = { disabled: true };
    const layer = {
      dataset: { selectionPickerId: "shared-picker" },
      querySelectorAll() { return [first, second]; },
      querySelector(selector) {
        return selector === ".selection-picker-secondary-confirm" ? secondaryConfirm : confirm;
      },
    };
    const root = { querySelectorAll() { return [layer]; } };

    assert.equal(syncSelectionPickerSelection(root, { pickerId: "shared-picker", selectedId: "second" }), true);
    assert.equal(first.selected, false);
    assert.equal(second.selected, true);
    assert.equal(confirm.disabled, false);
    assert.equal(secondaryConfirm.disabled, false);

    syncSelectionPickerSelection(root, {
      pickerId: "shared-picker",
      selectedId: "second",
      secondaryConfirmDisabled: true,
    });
    assert.equal(confirm.disabled, false);
    assert.equal(secondaryConfirm.disabled, true);
  });

  it("switches tabs and list content in place", () => {
    const officialTab = createPickerTab("official");
    const personalTab = createPickerTab("personal");
    const content = { innerHTML: "", scrollTop: 120 };
    const confirm = { disabled: false };
    const layer = {
      dataset: { selectionPickerId: "shared-picker" },
      querySelectorAll(selector) {
        return selector === "[data-picker-tab]" ? [officialTab, personalTab] : [];
      },
      querySelector(selector) {
        if (selector === ".selection-picker-content") return content;
        if (selector === ".selection-picker-confirm") return confirm;
        return null;
      },
    };
    const root = { querySelectorAll() { return [layer]; } };

    assert.equal(syncSelectionPickerTab(root, {
      pickerId: "shared-picker",
      activeTab: "personal",
      items: [
        { id: "official-1", group: "official", label: "官方资产" },
        { id: "personal-1", group: "personal", label: "个人资产" },
      ],
      selectAction: "select-asset",
    }), true);
    assert.equal(officialTab.selected, false);
    assert.equal(personalTab.selected, true);
    assert.match(content.innerHTML, /个人资产/);
    assert.doesNotMatch(content.innerHTML, /官方资产/);
    assert.match(content.innerHTML, /data-action="select-asset"/);
    assert.equal(content.scrollTop, 0);
    assert.equal(confirm.disabled, true);
  });
});

function createPickerItem(id) {
  const item = {
    dataset: { pickerItemId: id },
    selected: false,
    setAttribute(name, value) {
      if (name === "aria-selected") this.selected = value === "true";
    },
  };
  item.classList = {
    toggle(_name, selected) {
      item.selected = selected;
    },
  };
  return item;
}

function createPickerTab(id) {
  const tab = {
    dataset: { pickerTab: id },
    selected: false,
    setAttribute(name, value) {
      if (name === "aria-selected") this.selected = value === "true";
    },
  };
  tab.classList = {
    toggle(_name, selected) {
      tab.selected = selected;
    },
  };
  return tab;
}
