import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  renderSelectionPickerModal,
  syncSelectionPickerSelection,
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
