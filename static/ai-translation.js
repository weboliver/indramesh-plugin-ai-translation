import { Button as e, CheckboxField as t, LucideIcon as n, TextInput as r, api as i, injectPluginStyles as a, interpolateDefault as o, useCan as s, useFormatDateTime as c, useObject as l, useObjectType as u, usePluginTranslation as d } from "@indramesh/plugin-api";
import { useCallback as f, useEffect as p, useMemo as m, useRef as h, useState as g } from "react";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
import { Link as b } from "react-router-dom";
import { useQueryClient as x } from "@tanstack/react-query";
// ../plugins/ai-translation/frontend/locales/en.json
var S = {
	"panel.action": "Translate with AI",
	"panel.pending": "Preparing suggestions…",
	"panel.nothing_eligible": "All target fields are filled or edited. Nothing to suggest.",
	"panel.prerequisite": "Enable at least two languages for this schema to translate statuses and reference types.",
	"panel.conflict": "Suggestions for this item or its schema are already being prepared. Try again when that has finished.",
	"schema.heading": "AI translation",
	"schema.intro": "Suggests missing translations for the kinds you select below (ObjectTypes, attributes, select options, object values, statuses and reference types) in every enabled target language. You review the suggestions in the list below; nothing is saved automatically.",
	"schema.kinds.legend": "Translate",
	"schema.kinds.object_type": "ObjectTypes",
	"schema.kinds.object_type_attribute": "Attributes",
	"schema.kinds.select_option": "Select options",
	"schema.kinds.object_value": "Object values",
	"schema.kinds.status": "Statuses",
	"schema.kinds.reference_type": "Reference types",
	"schema.kinds.none_selected": "Select at least one kind to start a run.",
	"schema.missing.loading": "Counting missing translations…",
	"schema.missing.one": "{{count}} missing translation in this selection.",
	"schema.missing.other": "{{count}} missing translations in this selection.",
	"schema.missing.none": "No missing translations in this selection.",
	"schema.missing.waiting.one": "{{count}} of them already has a suggestion waiting for review.",
	"schema.missing.waiting.other": "{{count}} of them already have a suggestion waiting for review.",
	"schema.missing.all_waiting": "Every missing translation in this selection already has a suggestion waiting for review.",
	"schema.missing.unavailable": "The number of missing translations could not be loaded. You can still start a run.",
	"schema.open_count.one": "{{count}} suggestion is waiting for review in this schema.",
	"schema.open_count.other": "{{count}} suggestions are waiting for review in this schema.",
	"schema.empty.title": "No AI translation run yet",
	"schema.empty.body": "Start a run to get suggestions for missing translations. You review and save them in the list that appears here.",
	"schema.start": "Translate schema with AI",
	"schema.prerequisite": "Enable at least one target language for this schema to request translations.",
	"schema.conflict.body": "An AI translation is already running for this schema. Wait for it to finish, then start again.",
	"schema.run.queued.title": "Translation queued",
	"schema.run.queued.body": "The run starts shortly. You can leave this page.",
	"schema.run.running.title": "Translation running",
	"schema.run.running.body": "{{processed}} of {{total}} items processed. You can leave this page; the run continues.",
	"schema.run.finished.title": "Last run finished",
	"schema.run.finished.body": "{{generated}} suggestions created, {{skipped}} items skipped. Review and save them in the list below.",
	"schema.run.partial.title": "Last run partly finished",
	"schema.run.partial.body": "{{generated}} suggestions created; {{failed}} items could not be translated. Review the created suggestions in the list below. Start again to retry the rest.",
	"schema.run.provider_stop.title": "Last run stopped",
	"schema.run.provider_stop.body": "The AI service was unavailable after {{processed}} of {{total}} items. {{generated}} suggestions created before that are kept. Try again later.",
	"schema.run.cancelled.title": "Last run cancelled",
	"schema.run.cancelled.body": "Cancelled after {{processed}} of {{total}} items. {{generated}} suggestions created before cancelling are kept.",
	"schema.run.failed.title": "Last run failed",
	"schema.run.failed.body": "The run stopped unexpectedly. Suggestions created before that are kept. Open the task details for the log, or start again.",
	"run.started": "Started {{datetime}}",
	"run.task_link": "Open task details",
	"styles.refused.section": "The AI translation section could not be styled, so it is not shown. Manual translation still works.",
	"error.try_again": "Try again",
	"error.timeout.title": "AI service unavailable",
	"error.timeout.body": "The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment.",
	"error.unreachable.title": "AI service unavailable",
	"error.unreachable.body": "The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment.",
	"error.rate_limited.title": "AI service unavailable",
	"error.rate_limited.body": "The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment.",
	"error.not_configured.title": "AI translation is unavailable",
	"error.not_configured.body": "AI translation is not set up correctly. Ask an administrator to check the AI configuration. Manual translation still works.",
	"error.permission.title": "Permission required",
	"error.permission.body": "You no longer have permission for this AI translation. Manual translation still works. Ask an administrator for access.",
	"error.input_rejected.title": "AI translation failed",
	"error.input_rejected.body": "The request stopped unexpectedly. Nothing was changed. Try again.",
	"error.invalid_result.title": "AI translation failed",
	"error.invalid_result.body": "The request stopped unexpectedly. Nothing was changed. Try again.",
	"error.unexpected.title": "AI translation failed",
	"error.unexpected.body": "The request stopped unexpectedly. Nothing was changed. Try again.",
	"styles.refused": "The AI translation action could not be styled, so it is not shown. Manual translation still works.",
	"admin.action": "Translate with AI",
	"admin.eligible.one": "{{count}} missing text in this filter can be translated. One run covers up to 100.",
	"admin.eligible.other": "{{count}} missing texts in this filter can be translated. One run covers up to 100.",
	"admin.nothing_missing": "No missing translations in this filter.",
	"admin.missing_not_eligible": "The missing texts in this filter can't be translated with AI. They are technical strings, already have an open suggestion, or were discarded before. Translate them manually.",
	"admin.review.one": "Review {{count}} suggestion",
	"admin.review.other": "Review {{count}} suggestions",
	"admin.review.heading.one": "{{count}} suggestion to review for {{language}}",
	"admin.review.heading.other": "{{count}} suggestions to review for {{language}}",
	"admin.review.showing": "Showing {{shown}} of {{total}} suggestions. Apply or discard these to see the rest.",
	"admin.review.instruction": "Edit suggestions as needed, then choose Apply translations. Pressing Enter does not save a suggestion.",
	"admin.review.discard_help": "Discarded suggestions are not proposed again.",
	"admin.review.back": "Back to all texts",
	"admin.review.discard": "Discard suggestion",
	"admin.review.readonly": "You can review these suggestions. Saving or discarding them requires permission to edit translations.",
	"admin.apply": "Apply translations",
	"admin.apply_result.one": "{{written}} translation saved.",
	"admin.apply_result.other": "{{written}} translations saved.",
	"admin.apply_skipped": "{{skipped}} skipped because the text was filled in the meantime.",
	"admin.apply_invalid": "{{invalid}} not saved; see the marked rows.",
	"admin.skipped_label": "Skipped keys",
	"admin.apply_rejected.title": "Translations not saved",
	"admin.apply_rejected.body": "The suggestions could not be saved. Nothing was changed. Try again.",
	"admin.apply_unknown.title": "Result unknown",
	"admin.apply_unknown.body": "The response was interrupted. Check the table before applying again.",
	"admin.apply_unknown.reconcile": "Refetch suggestions",
	"admin.discard_failed": "The suggestion was not discarded. Try again.",
	"admin.row_invalid": "This suggestion was not saved. Edit or discard it.",
	"admin.conflict.body": "An AI translation for {{language}} is already in progress. Wait for it to finish, then start the next block.",
	"admin.run.queued.title": "Translation queued",
	"admin.run.queued.body": "The run starts shortly. You can change the filter or leave this page; the run continues.",
	"admin.run.running.title": "Translating {{language}}",
	"admin.run.running.body": "{{processed}} of {{total}} texts processed. You can change the filter or leave this page; the run continues.",
	"admin.run.finished.title": "Last run finished",
	"admin.run.finished.body": "{{generated}} suggestions created, {{skipped}} texts skipped. Review them in the translation table.",
	"admin.run.partial.title": "Last run partly finished",
	"admin.run.partial.body": "{{generated}} suggestions created; {{failed}} texts could not be translated. Start again to retry the rest.",
	"admin.run.provider_stop.title": "Last run stopped",
	"admin.run.provider_stop.body": "The AI service was unavailable after {{processed}} of {{total}} texts. {{generated}} suggestions created before that are kept. Try again later.",
	"admin.run.cancelled.title": "Last run cancelled",
	"admin.run.cancelled.body": "Cancelled after {{processed}} of {{total}} texts. {{generated}} suggestions created before cancelling are kept.",
	"admin.run.failed.title": "Last run failed",
	"admin.run.failed.body": "The run stopped unexpectedly. Suggestions created before that are kept. Open the task details for the log, or start again.",
	"review.title": "Suggestions to review",
	"review.apply": "Apply",
	"review.apply_all": "Apply all {{count}}",
	"review.discard": "Discard",
	"review.object": "Object",
	"review.value_label": "Translation ({{language}})",
	"review.outcome": "{{written}} saved, {{skipped}} skipped because a translation already exists, {{failed}} not saved.",
	"review.more": "More suggestions are waiting. They appear here once these are reviewed.",
	"review.type.object_type": "ObjectType",
	"review.type.object_type_attribute": "Attribute",
	"review.type.select_option": "Select option",
	"review.type.object_value": "Value",
	"review.type.status": "Status",
	"review.type.reference_type": "Reference type",
	"schema.run.reviewed.body": "{{generated}} suggestions created. All of them have been reviewed.",
	"error.conflict.title": "AI translation cannot start",
	"error.conflict.body": "The run was refused. If the plugin was just updated, an administrator has to restart the worker first. Nothing was changed."
}, C = {
	"panel.action": "Mit KI übersetzen",
	"panel.pending": "Vorschläge werden erstellt…",
	"panel.nothing_eligible": "Alle Zielfelder sind befüllt oder bearbeitet. Es gibt nichts vorzuschlagen.",
	"panel.prerequisite": "Aktivieren Sie mindestens zwei Sprachen für dieses Schema, um Status und Referenztypen zu übersetzen.",
	"panel.conflict": "Für diesen Eintrag oder sein Schema werden bereits Vorschläge erstellt. Versuchen Sie es erneut, sobald das abgeschlossen ist.",
	"schema.heading": "KI-Übersetzung",
	"schema.intro": "Schlägt fehlende Übersetzungen für die unten gewählten Arten (ObjectTypes, Attribute, Auswahloptionen, Objektwerte, Status und Referenztypen) in allen aktivierten Zielsprachen vor. Sie prüfen die Vorschläge in der Liste unten; es wird nichts automatisch gespeichert.",
	"schema.kinds.legend": "Übersetzen",
	"schema.kinds.object_type": "ObjectTypes",
	"schema.kinds.object_type_attribute": "Attribute",
	"schema.kinds.select_option": "Auswahloptionen",
	"schema.kinds.object_value": "Objektwerte",
	"schema.kinds.status": "Status",
	"schema.kinds.reference_type": "Referenztypen",
	"schema.kinds.none_selected": "Wählen Sie mindestens eine Art aus, um einen Lauf zu starten.",
	"schema.missing.loading": "Fehlende Übersetzungen werden gezählt…",
	"schema.missing.one": "{{count}} fehlende Übersetzung in dieser Auswahl.",
	"schema.missing.other": "{{count}} fehlende Übersetzungen in dieser Auswahl.",
	"schema.missing.none": "Keine fehlenden Übersetzungen in dieser Auswahl.",
	"schema.missing.waiting.one": "{{count}} davon hat bereits einen Vorschlag zur Prüfung.",
	"schema.missing.waiting.other": "{{count}} davon haben bereits einen Vorschlag zur Prüfung.",
	"schema.missing.all_waiting": "Für jede fehlende Übersetzung in dieser Auswahl liegt bereits ein Vorschlag zur Prüfung vor.",
	"schema.missing.unavailable": "Die Anzahl der fehlenden Übersetzungen konnte nicht geladen werden. Sie können trotzdem einen Lauf starten.",
	"schema.open_count.one": "{{count}} Vorschlag wartet in diesem Schema auf Prüfung.",
	"schema.open_count.other": "{{count}} Vorschläge warten in diesem Schema auf Prüfung.",
	"schema.empty.title": "Noch keine KI-Übersetzung ausgeführt",
	"schema.empty.body": "Starten Sie einen Lauf, um Vorschläge für fehlende Übersetzungen zu erhalten. Sie prüfen und speichern sie in der Liste, die hier erscheint.",
	"schema.start": "Schema mit KI übersetzen",
	"schema.prerequisite": "Aktivieren Sie mindestens eine Zielsprache für dieses Schema, um Übersetzungen anzufordern.",
	"schema.conflict.body": "Für dieses Schema läuft bereits eine KI-Übersetzung. Warten Sie, bis sie abgeschlossen ist, und starten Sie dann erneut.",
	"schema.run.queued.title": "Übersetzung eingereiht",
	"schema.run.queued.body": "Der Lauf beginnt in Kürze. Sie können diese Seite verlassen.",
	"schema.run.running.title": "Übersetzung läuft",
	"schema.run.running.body": "{{processed}} von {{total}} Einträgen verarbeitet. Sie können diese Seite verlassen; der Lauf wird fortgesetzt.",
	"schema.run.finished.title": "Letzter Lauf abgeschlossen",
	"schema.run.finished.body": "{{generated}} Vorschläge erstellt, {{skipped}} Einträge übersprungen. Prüfen und speichern Sie sie in der Liste unten.",
	"schema.run.partial.title": "Letzter Lauf teilweise abgeschlossen",
	"schema.run.partial.body": "{{generated}} Vorschläge erstellt; {{failed}} Einträge konnten nicht übersetzt werden. Prüfen Sie die erstellten Vorschläge in der Liste unten. Starten Sie erneut, um den Rest zu versuchen.",
	"schema.run.provider_stop.title": "Letzter Lauf vorzeitig beendet",
	"schema.run.provider_stop.body": "Der KI-Dienst war nach {{processed}} von {{total}} Einträgen nicht verfügbar. {{generated}} zuvor erstellte Vorschläge bleiben erhalten. Versuchen Sie es später erneut.",
	"schema.run.cancelled.title": "Letzter Lauf abgebrochen",
	"schema.run.cancelled.body": "Nach {{processed}} von {{total}} Einträgen abgebrochen. {{generated}} zuvor erstellte Vorschläge bleiben erhalten.",
	"schema.run.failed.title": "Letzter Lauf fehlgeschlagen",
	"schema.run.failed.body": "Der Lauf wurde unerwartet beendet. Zuvor erstellte Vorschläge bleiben erhalten. Öffnen Sie die Aufgabendetails für das Protokoll oder starten Sie erneut.",
	"run.started": "Gestartet {{datetime}}",
	"run.task_link": "Aufgabendetails öffnen",
	"styles.refused.section": "Der KI-Übersetzungsbereich konnte nicht gestaltet werden und wird daher nicht angezeigt. Die manuelle Übersetzung funktioniert weiterhin.",
	"error.try_again": "Erneut versuchen",
	"error.timeout.title": "KI-Dienst nicht verfügbar",
	"error.timeout.body": "Der KI-Dienst war nicht erreichbar oder hat nicht rechtzeitig geantwortet. Es wurde nichts geändert. Versuchen Sie es gleich erneut.",
	"error.unreachable.title": "KI-Dienst nicht verfügbar",
	"error.unreachable.body": "Der KI-Dienst war nicht erreichbar oder hat nicht rechtzeitig geantwortet. Es wurde nichts geändert. Versuchen Sie es gleich erneut.",
	"error.rate_limited.title": "KI-Dienst nicht verfügbar",
	"error.rate_limited.body": "Der KI-Dienst war nicht erreichbar oder hat nicht rechtzeitig geantwortet. Es wurde nichts geändert. Versuchen Sie es gleich erneut.",
	"error.not_configured.title": "KI-Übersetzung nicht verfügbar",
	"error.not_configured.body": "Die KI-Übersetzung ist nicht korrekt eingerichtet. Bitten Sie einen Administrator, die KI-Konfiguration zu prüfen. Die manuelle Übersetzung funktioniert weiterhin.",
	"error.permission.title": "Berechtigung erforderlich",
	"error.permission.body": "Sie haben keine Berechtigung mehr für diese KI-Übersetzung. Die manuelle Übersetzung funktioniert weiterhin. Bitten Sie einen Administrator um Zugriff.",
	"error.input_rejected.title": "KI-Übersetzung fehlgeschlagen",
	"error.input_rejected.body": "Die Anfrage wurde unerwartet abgebrochen. Es wurde nichts geändert. Versuchen Sie es erneut.",
	"error.invalid_result.title": "KI-Übersetzung fehlgeschlagen",
	"error.invalid_result.body": "Die Anfrage wurde unerwartet abgebrochen. Es wurde nichts geändert. Versuchen Sie es erneut.",
	"error.unexpected.title": "KI-Übersetzung fehlgeschlagen",
	"error.unexpected.body": "Die Anfrage wurde unerwartet abgebrochen. Es wurde nichts geändert. Versuchen Sie es erneut.",
	"styles.refused": "Die KI-Übersetzungsaktion konnte nicht gestaltet werden und wird daher nicht angezeigt. Die manuelle Übersetzung funktioniert weiterhin.",
	"admin.action": "Mit KI übersetzen",
	"admin.eligible.one": "{{count}} fehlender Text in diesem Filter kann übersetzt werden. Ein Lauf umfasst höchstens 100.",
	"admin.eligible.other": "{{count}} fehlende Texte in diesem Filter können übersetzt werden. Ein Lauf umfasst höchstens 100.",
	"admin.nothing_missing": "Keine fehlenden Übersetzungen in diesem Filter.",
	"admin.missing_not_eligible": "Die fehlenden Texte in diesem Filter können nicht mit KI übersetzt werden. Es sind technische Zeichenketten, sie haben bereits einen offenen Vorschlag oder wurden zuvor verworfen. Übersetzen Sie sie manuell.",
	"admin.review.one": "{{count}} Vorschlag prüfen",
	"admin.review.other": "{{count}} Vorschläge prüfen",
	"admin.review.heading.one": "{{count}} Vorschlag für {{language}} zu prüfen",
	"admin.review.heading.other": "{{count}} Vorschläge für {{language}} zu prüfen",
	"admin.review.showing": "{{shown}} von {{total}} Vorschlägen werden angezeigt. Übernehmen oder verwerfen Sie diese, um die übrigen zu sehen.",
	"admin.review.instruction": "Bearbeiten Sie die Vorschläge bei Bedarf und wählen Sie dann „Übersetzungen übernehmen“. Die Eingabetaste speichert keinen Vorschlag.",
	"admin.review.discard_help": "Verworfene Vorschläge werden nicht erneut vorgeschlagen.",
	"admin.review.back": "Zurück zu allen Texten",
	"admin.review.discard": "Vorschlag verwerfen",
	"admin.review.readonly": "Sie können diese Vorschläge prüfen. Zum Übernehmen oder Verwerfen ist eine Berechtigung zum Bearbeiten von Übersetzungen erforderlich.",
	"admin.apply": "Übersetzungen übernehmen",
	"admin.apply_result.one": "{{written}} Übersetzung gespeichert.",
	"admin.apply_result.other": "{{written}} Übersetzungen gespeichert.",
	"admin.apply_skipped": "{{skipped}} übersprungen, weil der Text inzwischen befüllt wurde.",
	"admin.apply_invalid": "{{invalid}} nicht gespeichert; siehe markierte Zeilen.",
	"admin.skipped_label": "Übersprungene Schlüssel",
	"admin.apply_rejected.title": "Übersetzungen nicht gespeichert",
	"admin.apply_rejected.body": "Die Vorschläge konnten nicht gespeichert werden. Es wurde nichts geändert. Versuchen Sie es erneut.",
	"admin.apply_unknown.title": "Ergebnis unbekannt",
	"admin.apply_unknown.body": "Die Antwort wurde unterbrochen. Prüfen Sie die Tabelle, bevor Sie erneut übernehmen.",
	"admin.apply_unknown.reconcile": "Vorschläge neu laden",
	"admin.discard_failed": "Der Vorschlag wurde nicht verworfen. Versuchen Sie es erneut.",
	"admin.row_invalid": "Dieser Vorschlag wurde nicht gespeichert. Bearbeiten oder verwerfen Sie ihn.",
	"admin.conflict.body": "Für {{language}} läuft bereits eine KI-Übersetzung. Warten Sie, bis sie abgeschlossen ist, und starten Sie dann den nächsten Block.",
	"admin.run.queued.title": "Übersetzung eingereiht",
	"admin.run.queued.body": "Der Lauf beginnt in Kürze. Sie können den Filter ändern oder diese Seite verlassen; der Lauf wird fortgesetzt.",
	"admin.run.running.title": "{{language}} wird übersetzt",
	"admin.run.running.body": "{{processed}} von {{total}} Texten verarbeitet. Sie können den Filter ändern oder diese Seite verlassen; der Lauf wird fortgesetzt.",
	"admin.run.finished.title": "Letzter Lauf abgeschlossen",
	"admin.run.finished.body": "{{generated}} Vorschläge erstellt, {{skipped}} Texte übersprungen. Prüfen Sie sie in der Übersetzungstabelle.",
	"admin.run.partial.title": "Letzter Lauf teilweise abgeschlossen",
	"admin.run.partial.body": "{{generated}} Vorschläge erstellt; {{failed}} Texte konnten nicht übersetzt werden. Starten Sie erneut, um den Rest zu versuchen.",
	"admin.run.provider_stop.title": "Letzter Lauf vorzeitig beendet",
	"admin.run.provider_stop.body": "Der KI-Dienst war nach {{processed}} von {{total}} Texten nicht verfügbar. {{generated}} zuvor erstellte Vorschläge bleiben erhalten. Versuchen Sie es später erneut.",
	"admin.run.cancelled.title": "Letzter Lauf abgebrochen",
	"admin.run.cancelled.body": "Nach {{processed}} von {{total}} Texten abgebrochen. {{generated}} zuvor erstellte Vorschläge bleiben erhalten.",
	"admin.run.failed.title": "Letzter Lauf fehlgeschlagen",
	"admin.run.failed.body": "Der Lauf wurde unerwartet beendet. Zuvor erstellte Vorschläge bleiben erhalten. Öffnen Sie die Aufgabendetails für das Protokoll oder starten Sie erneut.",
	"review.title": "Vorschläge zur Prüfung",
	"review.apply": "Übernehmen",
	"review.apply_all": "Alle {{count}} übernehmen",
	"review.discard": "Verwerfen",
	"review.object": "Objekt",
	"review.value_label": "Übersetzung ({{language}})",
	"review.outcome": "{{written}} gespeichert, {{skipped}} übersprungen, weil schon eine Übersetzung existiert, {{failed}} nicht gespeichert.",
	"review.more": "Weitere Vorschläge warten. Sie erscheinen hier, sobald diese geprüft sind.",
	"review.type.object_type": "ObjectType",
	"review.type.object_type_attribute": "Attribut",
	"review.type.select_option": "Auswahloption",
	"review.type.object_value": "Wert",
	"review.type.status": "Status",
	"review.type.reference_type": "Referenztyp",
	"schema.run.reviewed.body": "{{generated}} Vorschläge erstellt. Alle wurden geprüft.",
	"error.conflict.title": "KI-Übersetzung kann nicht starten",
	"error.conflict.body": "Der Lauf wurde abgelehnt. Wurde das Plugin gerade aktualisiert, muss ein Administrator zuerst den Worker neu starten. Es wurde nichts geändert."
}, w = {
	"panel.action": "Traducir con IA",
	"panel.pending": "Preparando sugerencias…",
	"panel.nothing_eligible": "Todos los campos de destino están rellenados o editados. No hay nada que sugerir.",
	"panel.prerequisite": "Active al menos dos idiomas para este esquema para traducir estados y tipos de referencia.",
	"panel.conflict": "Ya se están preparando sugerencias para este elemento o su esquema. Vuelva a intentarlo cuando termine.",
	"schema.heading": "Traducción con IA",
	"schema.intro": "Sugiere traducciones que faltan para los tipos que seleccione abajo (ObjectTypes, atributos, opciones de selección, valores de objeto, estados y tipos de referencia) en todos los idiomas de destino activados. Revise las sugerencias en la lista de abajo; no se guarda nada automáticamente.",
	"schema.kinds.legend": "Traducir",
	"schema.kinds.object_type": "ObjectTypes",
	"schema.kinds.object_type_attribute": "Atributos",
	"schema.kinds.select_option": "Opciones de selección",
	"schema.kinds.object_value": "Valores de objeto",
	"schema.kinds.status": "Estados",
	"schema.kinds.reference_type": "Tipos de referencia",
	"schema.kinds.none_selected": "Seleccione al menos un tipo para iniciar una ejecución.",
	"schema.missing.loading": "Contando traducciones que faltan…",
	"schema.missing.one": "{{count}} traducción que falta en esta selección.",
	"schema.missing.other": "{{count}} traducciones que faltan en esta selección.",
	"schema.missing.none": "No faltan traducciones en esta selección.",
	"schema.missing.waiting.one": "{{count}} de ellas ya tiene una sugerencia pendiente de revisión.",
	"schema.missing.waiting.other": "{{count}} de ellas ya tienen una sugerencia pendiente de revisión.",
	"schema.missing.all_waiting": "Todas las traducciones que faltan en esta selección ya tienen una sugerencia pendiente de revisión.",
	"schema.missing.unavailable": "No se pudo cargar el número de traducciones que faltan. Aún puede iniciar una ejecución.",
	"schema.open_count.one": "{{count}} sugerencia espera revisión en este esquema.",
	"schema.open_count.other": "{{count}} sugerencias esperan revisión en este esquema.",
	"schema.empty.title": "Aún no se ha ejecutado ninguna traducción con IA",
	"schema.empty.body": "Inicie una ejecución para obtener sugerencias de traducciones que faltan. Las revisa y las guarda en la lista que aparece aquí.",
	"schema.start": "Traducir esquema con IA",
	"schema.prerequisite": "Active al menos un idioma de destino para este esquema para solicitar traducciones.",
	"schema.conflict.body": "Ya se está ejecutando una traducción con IA para este esquema. Espere a que termine y vuelva a iniciarla.",
	"schema.run.queued.title": "Traducción en cola",
	"schema.run.queued.body": "La ejecución comenzará en breve. Puede salir de esta página.",
	"schema.run.running.title": "Traducción en curso",
	"schema.run.running.body": "{{processed}} de {{total}} elementos procesados. Puede salir de esta página; la ejecución continúa.",
	"schema.run.finished.title": "Última ejecución completada",
	"schema.run.finished.body": "{{generated}} sugerencias creadas, {{skipped}} elementos omitidos. Revíselas y guárdelas en la lista de abajo.",
	"schema.run.partial.title": "Última ejecución completada parcialmente",
	"schema.run.partial.body": "{{generated}} sugerencias creadas; {{failed}} elementos no se pudieron traducir. Revise las sugerencias creadas en la lista de abajo. Inicie de nuevo para reintentar el resto.",
	"schema.run.provider_stop.title": "Última ejecución detenida",
	"schema.run.provider_stop.body": "El servicio de IA no estuvo disponible tras {{processed}} de {{total}} elementos. Las {{generated}} sugerencias creadas antes se conservan. Vuelva a intentarlo más tarde.",
	"schema.run.cancelled.title": "Última ejecución cancelada",
	"schema.run.cancelled.body": "Cancelada tras {{processed}} de {{total}} elementos. Las {{generated}} sugerencias creadas antes de cancelar se conservan.",
	"schema.run.failed.title": "Última ejecución fallida",
	"schema.run.failed.body": "La ejecución se detuvo inesperadamente. Las sugerencias creadas antes se conservan. Abra los detalles de la tarea para ver el registro o inicie de nuevo.",
	"run.started": "Iniciada {{datetime}}",
	"run.task_link": "Abrir detalles de la tarea",
	"styles.refused.section": "No se pudo aplicar el estilo a la sección de traducción con IA, por lo que no se muestra. La traducción manual sigue funcionando.",
	"error.try_again": "Reintentar",
	"error.timeout.title": "Servicio de IA no disponible",
	"error.timeout.body": "No se pudo contactar con el servicio de IA o no respondió a tiempo. No se cambió nada. Vuelva a intentarlo en un momento.",
	"error.unreachable.title": "Servicio de IA no disponible",
	"error.unreachable.body": "No se pudo contactar con el servicio de IA o no respondió a tiempo. No se cambió nada. Vuelva a intentarlo en un momento.",
	"error.rate_limited.title": "Servicio de IA no disponible",
	"error.rate_limited.body": "No se pudo contactar con el servicio de IA o no respondió a tiempo. No se cambió nada. Vuelva a intentarlo en un momento.",
	"error.not_configured.title": "La traducción con IA no está disponible",
	"error.not_configured.body": "La traducción con IA no está configurada correctamente. Pida a un administrador que revise la configuración de IA. La traducción manual sigue funcionando.",
	"error.permission.title": "Se requiere permiso",
	"error.permission.body": "Ya no tiene permiso para esta traducción con IA. La traducción manual sigue funcionando. Pida acceso a un administrador.",
	"error.input_rejected.title": "La traducción con IA falló",
	"error.input_rejected.body": "La solicitud se detuvo inesperadamente. No se cambió nada. Vuelva a intentarlo.",
	"error.invalid_result.title": "La traducción con IA falló",
	"error.invalid_result.body": "La solicitud se detuvo inesperadamente. No se cambió nada. Vuelva a intentarlo.",
	"error.unexpected.title": "La traducción con IA falló",
	"error.unexpected.body": "La solicitud se detuvo inesperadamente. No se cambió nada. Vuelva a intentarlo.",
	"styles.refused": "No se pudo aplicar el estilo a la acción de traducción con IA, por lo que no se muestra. La traducción manual sigue funcionando.",
	"admin.action": "Traducir con IA",
	"admin.eligible.one": "{{count}} texto faltante en este filtro se puede traducir. Una ejecución cubre hasta 100.",
	"admin.eligible.other": "{{count}} textos faltantes en este filtro se pueden traducir. Una ejecución cubre hasta 100.",
	"admin.nothing_missing": "No hay traducciones faltantes en este filtro.",
	"admin.missing_not_eligible": "Los textos faltantes de este filtro no se pueden traducir con IA. Son cadenas técnicas, ya tienen una sugerencia abierta o se descartaron antes. Tradúzcalos manualmente.",
	"admin.review.one": "Revisar {{count}} sugerencia",
	"admin.review.other": "Revisar {{count}} sugerencias",
	"admin.review.heading.one": "{{count}} sugerencia para revisar en {{language}}",
	"admin.review.heading.other": "{{count}} sugerencias para revisar en {{language}}",
	"admin.review.showing": "Mostrando {{shown}} de {{total}} sugerencias. Aplique o descarte estas para ver el resto.",
	"admin.review.instruction": "Edite las sugerencias según sea necesario y luego elija Aplicar traducciones. Pulsar Intro no guarda una sugerencia.",
	"admin.review.discard_help": "Las sugerencias descartadas no se vuelven a proponer.",
	"admin.review.back": "Volver a todos los textos",
	"admin.review.discard": "Descartar sugerencia",
	"admin.review.readonly": "Puede revisar estas sugerencias. Guardarlas o descartarlas requiere permiso para editar traducciones.",
	"admin.apply": "Aplicar traducciones",
	"admin.apply_result.one": "{{written}} traducción guardada.",
	"admin.apply_result.other": "{{written}} traducciones guardadas.",
	"admin.apply_skipped": "{{skipped}} omitidas porque el texto se rellenó mientras tanto.",
	"admin.apply_invalid": "{{invalid}} no guardadas; consulte las filas marcadas.",
	"admin.skipped_label": "Claves omitidas",
	"admin.apply_rejected.title": "Traducciones no guardadas",
	"admin.apply_rejected.body": "Las sugerencias no se pudieron guardar. No se cambió nada. Vuelva a intentarlo.",
	"admin.apply_unknown.title": "Resultado desconocido",
	"admin.apply_unknown.body": "La respuesta se interrumpió. Compruebe la tabla antes de volver a aplicar.",
	"admin.apply_unknown.reconcile": "Volver a cargar sugerencias",
	"admin.discard_failed": "La sugerencia no se descartó. Vuelva a intentarlo.",
	"admin.row_invalid": "Esta sugerencia no se guardó. Edítela o descártela.",
	"admin.conflict.body": "Ya hay una traducción con IA en curso para {{language}}. Espere a que termine y luego inicie el siguiente bloque.",
	"admin.run.queued.title": "Traducción en cola",
	"admin.run.queued.body": "La ejecución comenzará en breve. Puede cambiar el filtro o salir de esta página; la ejecución continúa.",
	"admin.run.running.title": "Traduciendo {{language}}",
	"admin.run.running.body": "{{processed}} de {{total}} textos procesados. Puede cambiar el filtro o salir de esta página; la ejecución continúa.",
	"admin.run.finished.title": "Última ejecución completada",
	"admin.run.finished.body": "{{generated}} sugerencias creadas, {{skipped}} textos omitidos. Revíselas en la tabla de traducción.",
	"admin.run.partial.title": "Última ejecución completada parcialmente",
	"admin.run.partial.body": "{{generated}} sugerencias creadas; {{failed}} textos no se pudieron traducir. Inicie de nuevo para reintentar el resto.",
	"admin.run.provider_stop.title": "Última ejecución detenida",
	"admin.run.provider_stop.body": "El servicio de IA no estuvo disponible tras {{processed}} de {{total}} textos. Las {{generated}} sugerencias creadas antes se conservan. Vuelva a intentarlo más tarde.",
	"admin.run.cancelled.title": "Última ejecución cancelada",
	"admin.run.cancelled.body": "Cancelada tras {{processed}} de {{total}} textos. Las {{generated}} sugerencias creadas antes de cancelar se conservan.",
	"admin.run.failed.title": "Última ejecución fallida",
	"admin.run.failed.body": "La ejecución se detuvo inesperadamente. Las sugerencias creadas antes se conservan. Abra los detalles de la tarea para ver el registro o inicie de nuevo.",
	"review.title": "Sugerencias para revisar",
	"review.apply": "Aplicar",
	"review.apply_all": "Aplicar las {{count}}",
	"review.discard": "Descartar",
	"review.object": "Objeto",
	"review.value_label": "Traducción ({{language}})",
	"review.outcome": "{{written}} guardadas, {{skipped}} omitidas porque ya existe una traducción, {{failed}} sin guardar.",
	"review.more": "Hay más sugerencias pendientes. Aparecerán aquí cuando se hayan revisado estas.",
	"review.type.object_type": "ObjectType",
	"review.type.object_type_attribute": "Atributo",
	"review.type.select_option": "Opción de selección",
	"review.type.object_value": "Valor",
	"review.type.status": "Estado",
	"review.type.reference_type": "Tipo de referencia",
	"schema.run.reviewed.body": "{{generated}} sugerencias creadas. Todas han sido revisadas.",
	"error.conflict.title": "La traducción con IA no puede iniciarse",
	"error.conflict.body": "La ejecución fue rechazada. Si el plugin se acaba de actualizar, un administrador debe reiniciar primero el worker. No se ha cambiado nada."
}, T = {
	"panel.action": "Traduire avec l'IA",
	"panel.pending": "Préparation des suggestions…",
	"panel.nothing_eligible": "Tous les champs cibles sont remplis ou modifiés. Rien à suggérer.",
	"panel.prerequisite": "Activez au moins deux langues pour ce schéma afin de traduire les statuts et les types de référence.",
	"panel.conflict": "Des suggestions sont déjà en préparation pour cet élément ou son schéma. Réessayez une fois terminé.",
	"schema.heading": "Traduction par IA",
	"schema.intro": "Suggère les traductions manquantes pour les types que vous sélectionnez ci-dessous (ObjectTypes, attributs, options de sélection, valeurs d'objet, statuts et types de référence) dans toutes les langues cibles activées. Vous validez les suggestions dans la liste ci-dessous ; rien n'est enregistré automatiquement.",
	"schema.kinds.legend": "Traduire",
	"schema.kinds.object_type": "ObjectTypes",
	"schema.kinds.object_type_attribute": "Attributs",
	"schema.kinds.select_option": "Options de sélection",
	"schema.kinds.object_value": "Valeurs d'objet",
	"schema.kinds.status": "Statuts",
	"schema.kinds.reference_type": "Types de référence",
	"schema.kinds.none_selected": "Sélectionnez au moins un type pour lancer une exécution.",
	"schema.missing.loading": "Comptage des traductions manquantes…",
	"schema.missing.one": "{{count}} traduction manquante dans cette sélection.",
	"schema.missing.other": "{{count}} traductions manquantes dans cette sélection.",
	"schema.missing.none": "Aucune traduction manquante dans cette sélection.",
	"schema.missing.waiting.one": "{{count}} d'entre elles a déjà une suggestion en attente de relecture.",
	"schema.missing.waiting.other": "{{count}} d'entre elles ont déjà une suggestion en attente de relecture.",
	"schema.missing.all_waiting": "Chaque traduction manquante de cette sélection a déjà une suggestion en attente de relecture.",
	"schema.missing.unavailable": "Le nombre de traductions manquantes n'a pas pu être chargé. Vous pouvez tout de même lancer une exécution.",
	"schema.open_count.one": "{{count}} suggestion attend une validation dans ce schéma.",
	"schema.open_count.other": "{{count}} suggestions attendent une validation dans ce schéma.",
	"schema.empty.title": "Aucune traduction par IA n'a encore été exécutée",
	"schema.empty.body": "Lancez une exécution pour obtenir des suggestions de traductions manquantes. Vous les validez et les enregistrez dans la liste qui apparaît ici.",
	"schema.start": "Traduire le schéma avec l'IA",
	"schema.prerequisite": "Activez au moins une langue cible pour ce schéma afin de demander des traductions.",
	"schema.conflict.body": "Une traduction par IA est déjà en cours pour ce schéma. Attendez qu'elle se termine, puis relancez.",
	"schema.run.queued.title": "Traduction en file d'attente",
	"schema.run.queued.body": "L'exécution démarre bientôt. Vous pouvez quitter cette page.",
	"schema.run.running.title": "Traduction en cours",
	"schema.run.running.body": "{{processed}} sur {{total}} éléments traités. Vous pouvez quitter cette page ; l'exécution continue.",
	"schema.run.finished.title": "Dernière exécution terminée",
	"schema.run.finished.body": "{{generated}} suggestions créées, {{skipped}} éléments ignorés. Validez-les et enregistrez-les dans la liste ci-dessous.",
	"schema.run.partial.title": "Dernière exécution partiellement terminée",
	"schema.run.partial.body": "{{generated}} suggestions créées ; {{failed}} éléments n'ont pas pu être traduits. Validez les suggestions créées dans la liste ci-dessous. Relancez pour réessayer le reste.",
	"schema.run.provider_stop.title": "Dernière exécution arrêtée",
	"schema.run.provider_stop.body": "Le service d'IA était indisponible après {{processed}} sur {{total}} éléments. Les {{generated}} suggestions créées avant sont conservées. Réessayez plus tard.",
	"schema.run.cancelled.title": "Dernière exécution annulée",
	"schema.run.cancelled.body": "Annulée après {{processed}} sur {{total}} éléments. Les {{generated}} suggestions créées avant l'annulation sont conservées.",
	"schema.run.failed.title": "Dernière exécution échouée",
	"schema.run.failed.body": "L'exécution s'est arrêtée de manière inattendue. Les suggestions créées avant sont conservées. Ouvrez les détails de la tâche pour le journal, ou relancez.",
	"run.started": "Démarrée {{datetime}}",
	"run.task_link": "Ouvrir les détails de la tâche",
	"styles.refused.section": "Le style de la section de traduction par IA n'a pas pu être appliqué, elle n'est donc pas affichée. La traduction manuelle fonctionne toujours.",
	"error.try_again": "Réessayer",
	"error.timeout.title": "Service d'IA indisponible",
	"error.timeout.body": "Le service d'IA n'a pas pu être contacté ou n'a pas répondu à temps. Rien n'a été modifié. Réessayez dans un instant.",
	"error.unreachable.title": "Service d'IA indisponible",
	"error.unreachable.body": "Le service d'IA n'a pas pu être contacté ou n'a pas répondu à temps. Rien n'a été modifié. Réessayez dans un instant.",
	"error.rate_limited.title": "Service d'IA indisponible",
	"error.rate_limited.body": "Le service d'IA n'a pas pu être contacté ou n'a pas répondu à temps. Rien n'a été modifié. Réessayez dans un instant.",
	"error.not_configured.title": "La traduction par IA est indisponible",
	"error.not_configured.body": "La traduction par IA n'est pas correctement configurée. Demandez à un administrateur de vérifier la configuration de l'IA. La traduction manuelle fonctionne toujours.",
	"error.permission.title": "Autorisation requise",
	"error.permission.body": "Vous n'avez plus l'autorisation pour cette traduction par IA. La traduction manuelle fonctionne toujours. Demandez l'accès à un administrateur.",
	"error.input_rejected.title": "La traduction par IA a échoué",
	"error.input_rejected.body": "La requête s'est arrêtée de manière inattendue. Rien n'a été modifié. Réessayez.",
	"error.invalid_result.title": "La traduction par IA a échoué",
	"error.invalid_result.body": "La requête s'est arrêtée de manière inattendue. Rien n'a été modifié. Réessayez.",
	"error.unexpected.title": "La traduction par IA a échoué",
	"error.unexpected.body": "La requête s'est arrêtée de manière inattendue. Rien n'a été modifié. Réessayez.",
	"styles.refused": "Le style de l'action de traduction par IA n'a pas pu être appliqué, elle n'est donc pas affichée. La traduction manuelle fonctionne toujours.",
	"admin.action": "Traduire avec l'IA",
	"admin.eligible.one": "{{count}} texte manquant dans ce filtre peut être traduit. Une exécution couvre jusqu'à 100.",
	"admin.eligible.other": "{{count}} textes manquants dans ce filtre peuvent être traduits. Une exécution couvre jusqu'à 100.",
	"admin.nothing_missing": "Aucune traduction manquante dans ce filtre.",
	"admin.missing_not_eligible": "Les textes manquants de ce filtre ne peuvent pas être traduits par IA. Ce sont des chaînes techniques, elles ont déjà une suggestion ouverte, ou elles ont été écartées auparavant. Traduisez-les manuellement.",
	"admin.review.one": "Valider {{count}} suggestion",
	"admin.review.other": "Valider {{count}} suggestions",
	"admin.review.heading.one": "{{count}} suggestion à valider pour {{language}}",
	"admin.review.heading.other": "{{count}} suggestions à valider pour {{language}}",
	"admin.review.showing": "Affichage de {{shown}} sur {{total}} suggestions. Appliquez ou écartez celles-ci pour voir le reste.",
	"admin.review.instruction": "Modifiez les suggestions si nécessaire, puis choisissez Appliquer les traductions. Appuyer sur Entrée n'enregistre pas une suggestion.",
	"admin.review.discard_help": "Les suggestions écartées ne sont pas proposées à nouveau.",
	"admin.review.back": "Retour à tous les textes",
	"admin.review.discard": "Écarter la suggestion",
	"admin.review.readonly": "Vous pouvez valider ces suggestions. Les enregistrer ou les écarter nécessite l'autorisation de modifier les traductions.",
	"admin.apply": "Appliquer les traductions",
	"admin.apply_result.one": "{{written}} traduction enregistrée.",
	"admin.apply_result.other": "{{written}} traductions enregistrées.",
	"admin.apply_skipped": "{{skipped}} ignorées car le texte a été rempli entre-temps.",
	"admin.apply_invalid": "{{invalid}} non enregistrées ; voir les lignes signalées.",
	"admin.skipped_label": "Clés ignorées",
	"admin.apply_rejected.title": "Traductions non enregistrées",
	"admin.apply_rejected.body": "Les suggestions n'ont pas pu être enregistrées. Rien n'a été modifié. Réessayez.",
	"admin.apply_unknown.title": "Résultat inconnu",
	"admin.apply_unknown.body": "La réponse a été interrompue. Vérifiez le tableau avant de réappliquer.",
	"admin.apply_unknown.reconcile": "Recharger les suggestions",
	"admin.discard_failed": "La suggestion n'a pas été écartée. Réessayez.",
	"admin.row_invalid": "Cette suggestion n'a pas été enregistrée. Modifiez-la ou abandonnez-la.",
	"admin.conflict.body": "Une traduction par IA est déjà en cours pour {{language}}. Attendez qu'elle se termine, puis lancez le bloc suivant.",
	"admin.run.queued.title": "Traduction en file d'attente",
	"admin.run.queued.body": "L'exécution démarre bientôt. Vous pouvez changer le filtre ou quitter cette page ; l'exécution continue.",
	"admin.run.running.title": "Traduction de {{language}}",
	"admin.run.running.body": "{{processed}} sur {{total}} textes traités. Vous pouvez changer le filtre ou quitter cette page ; l'exécution continue.",
	"admin.run.finished.title": "Dernière exécution terminée",
	"admin.run.finished.body": "{{generated}} suggestions créées, {{skipped}} textes ignorés. Validez-les dans le tableau de traduction.",
	"admin.run.partial.title": "Dernière exécution partiellement terminée",
	"admin.run.partial.body": "{{generated}} suggestions créées ; {{failed}} textes n'ont pas pu être traduits. Relancez pour réessayer le reste.",
	"admin.run.provider_stop.title": "Dernière exécution arrêtée",
	"admin.run.provider_stop.body": "Le service d'IA était indisponible après {{processed}} sur {{total}} textes. Les {{generated}} suggestions créées avant sont conservées. Réessayez plus tard.",
	"admin.run.cancelled.title": "Dernière exécution annulée",
	"admin.run.cancelled.body": "Annulée après {{processed}} sur {{total}} textes. Les {{generated}} suggestions créées avant l'annulation sont conservées.",
	"admin.run.failed.title": "Dernière exécution échouée",
	"admin.run.failed.body": "L'exécution s'est arrêtée de manière inattendue. Les suggestions créées avant sont conservées. Ouvrez les détails de la tâche pour le journal, ou relancez.",
	"review.title": "Suggestions à valider",
	"review.apply": "Appliquer",
	"review.apply_all": "Appliquer les {{count}}",
	"review.discard": "Rejeter",
	"review.object": "Objet",
	"review.value_label": "Traduction ({{language}})",
	"review.outcome": "{{written}} enregistrées, {{skipped}} ignorées car une traduction existe déjà, {{failed}} non enregistrées.",
	"review.more": "D'autres suggestions attendent. Elles apparaîtront ici une fois celles-ci validées.",
	"review.type.object_type": "ObjectType",
	"review.type.object_type_attribute": "Attribut",
	"review.type.select_option": "Option de sélection",
	"review.type.object_value": "Valeur",
	"review.type.status": "Statut",
	"review.type.reference_type": "Type de référence",
	"schema.run.reviewed.body": "{{generated}} suggestions créées. Toutes ont été validées.",
	"error.conflict.title": "La traduction IA ne peut pas démarrer",
	"error.conflict.body": "L'exécution a été refusée. Si le plugin vient d'être mis à jour, un administrateur doit d'abord redémarrer le worker. Rien n'a été modifié."
}, E = {
	"panel.action": "Traduzir com IA",
	"panel.pending": "A preparar sugestões…",
	"panel.nothing_eligible": "Todos os campos de destino estão preenchidos ou editados. Não há nada a sugerir.",
	"panel.prerequisite": "Ative pelo menos dois idiomas para este esquema para traduzir estados e tipos de referência.",
	"panel.conflict": "Já estão a ser preparadas sugestões para este item ou o seu esquema. Tente novamente quando terminar.",
	"schema.heading": "Tradução por IA",
	"schema.intro": "Sugere traduções em falta para os tipos que selecionar abaixo (ObjectTypes, atributos, opções de seleção, valores de objeto, estados e tipos de referência) em todos os idiomas de destino ativados. Reveja as sugestões na lista abaixo; nada é guardado automaticamente.",
	"schema.kinds.legend": "Traduzir",
	"schema.kinds.object_type": "ObjectTypes",
	"schema.kinds.object_type_attribute": "Atributos",
	"schema.kinds.select_option": "Opções de seleção",
	"schema.kinds.object_value": "Valores de objeto",
	"schema.kinds.status": "Estados",
	"schema.kinds.reference_type": "Tipos de referência",
	"schema.kinds.none_selected": "Selecione pelo menos um tipo para iniciar uma execução.",
	"schema.missing.loading": "A contar traduções em falta…",
	"schema.missing.one": "{{count}} tradução em falta nesta seleção.",
	"schema.missing.other": "{{count}} traduções em falta nesta seleção.",
	"schema.missing.none": "Não há traduções em falta nesta seleção.",
	"schema.missing.waiting.one": "{{count}} delas já tem uma sugestão a aguardar revisão.",
	"schema.missing.waiting.other": "{{count}} delas já têm uma sugestão a aguardar revisão.",
	"schema.missing.all_waiting": "Todas as traduções em falta nesta seleção já têm uma sugestão a aguardar revisão.",
	"schema.missing.unavailable": "Não foi possível carregar o número de traduções em falta. Pode na mesma iniciar uma execução.",
	"schema.open_count.one": "{{count}} sugestão aguarda revisão neste esquema.",
	"schema.open_count.other": "{{count}} sugestões aguardam revisão neste esquema.",
	"schema.empty.title": "Ainda não foi executada nenhuma tradução por IA",
	"schema.empty.body": "Inicie uma execução para obter sugestões de traduções em falta. Revê-as e guarda-as na lista que aparece aqui.",
	"schema.start": "Traduzir esquema com IA",
	"schema.prerequisite": "Ative pelo menos um idioma de destino para este esquema para solicitar traduções.",
	"schema.conflict.body": "Já está a decorrer uma tradução por IA para este esquema. Aguarde que termine e inicie novamente.",
	"schema.run.queued.title": "Tradução em fila",
	"schema.run.queued.body": "A execução começa em breve. Pode sair desta página.",
	"schema.run.running.title": "Tradução em curso",
	"schema.run.running.body": "{{processed}} de {{total}} itens processados. Pode sair desta página; a execução continua.",
	"schema.run.finished.title": "Última execução concluída",
	"schema.run.finished.body": "{{generated}} sugestões criadas, {{skipped}} itens ignorados. Reveja-as e guarde-as na lista abaixo.",
	"schema.run.partial.title": "Última execução parcialmente concluída",
	"schema.run.partial.body": "{{generated}} sugestões criadas; {{failed}} itens não puderam ser traduzidos. Reveja as sugestões criadas na lista abaixo. Inicie novamente para tentar o resto.",
	"schema.run.provider_stop.title": "Última execução interrompida",
	"schema.run.provider_stop.body": "O serviço de IA ficou indisponível após {{processed}} de {{total}} itens. As {{generated}} sugestões criadas antes são mantidas. Tente novamente mais tarde.",
	"schema.run.cancelled.title": "Última execução cancelada",
	"schema.run.cancelled.body": "Cancelada após {{processed}} de {{total}} itens. As {{generated}} sugestões criadas antes do cancelamento são mantidas.",
	"schema.run.failed.title": "Última execução falhou",
	"schema.run.failed.body": "A execução parou inesperadamente. As sugestões criadas antes são mantidas. Abra os detalhes da tarefa para o registo ou inicie novamente.",
	"run.started": "Iniciada {{datetime}}",
	"run.task_link": "Abrir detalhes da tarefa",
	"styles.refused.section": "O estilo da secção de tradução por IA não pôde ser aplicado, por isso não é apresentada. A tradução manual continua a funcionar.",
	"error.try_again": "Tentar novamente",
	"error.timeout.title": "Serviço de IA indisponível",
	"error.timeout.body": "O serviço de IA não pôde ser contactado ou não respondeu a tempo. Nada foi alterado. Tente novamente dentro de momentos.",
	"error.unreachable.title": "Serviço de IA indisponível",
	"error.unreachable.body": "O serviço de IA não pôde ser contactado ou não respondeu a tempo. Nada foi alterado. Tente novamente dentro de momentos.",
	"error.rate_limited.title": "Serviço de IA indisponível",
	"error.rate_limited.body": "O serviço de IA não pôde ser contactado ou não respondeu a tempo. Nada foi alterado. Tente novamente dentro de momentos.",
	"error.not_configured.title": "A tradução por IA está indisponível",
	"error.not_configured.body": "A tradução por IA não está configurada corretamente. Peça a um administrador para verificar a configuração da IA. A tradução manual continua a funcionar.",
	"error.permission.title": "Permissão necessária",
	"error.permission.body": "Já não tem permissão para esta tradução por IA. A tradução manual continua a funcionar. Peça acesso a um administrador.",
	"error.input_rejected.title": "A tradução por IA falhou",
	"error.input_rejected.body": "O pedido parou inesperadamente. Nada foi alterado. Tente novamente.",
	"error.invalid_result.title": "A tradução por IA falhou",
	"error.invalid_result.body": "O pedido parou inesperadamente. Nada foi alterado. Tente novamente.",
	"error.unexpected.title": "A tradução por IA falhou",
	"error.unexpected.body": "O pedido parou inesperadamente. Nada foi alterado. Tente novamente.",
	"styles.refused": "O estilo da ação de tradução por IA não pôde ser aplicado, por isso não é apresentada. A tradução manual continua a funcionar.",
	"admin.action": "Traduzir com IA",
	"admin.eligible.one": "{{count}} texto em falta neste filtro pode ser traduzido. Uma execução cobre até 100.",
	"admin.eligible.other": "{{count}} textos em falta neste filtro podem ser traduzidos. Uma execução cobre até 100.",
	"admin.nothing_missing": "Nenhuma tradução em falta neste filtro.",
	"admin.missing_not_eligible": "Os textos em falta neste filtro não podem ser traduzidos por IA. São cadeias técnicas, já têm uma sugestão aberta ou foram descartados antes. Traduza-os manualmente.",
	"admin.review.one": "Rever {{count}} sugestão",
	"admin.review.other": "Rever {{count}} sugestões",
	"admin.review.heading.one": "{{count}} sugestão para rever em {{language}}",
	"admin.review.heading.other": "{{count}} sugestões para rever em {{language}}",
	"admin.review.showing": "A mostrar {{shown}} de {{total}} sugestões. Aplique ou descarte estas para ver o resto.",
	"admin.review.instruction": "Edite as sugestões conforme necessário e, em seguida, escolha Aplicar traduções. Premir Enter não guarda uma sugestão.",
	"admin.review.discard_help": "As sugestões descartadas não são propostas novamente.",
	"admin.review.back": "Voltar a todos os textos",
	"admin.review.discard": "Descartar sugestão",
	"admin.review.readonly": "Pode rever estas sugestões. Guardá-las ou descartá-las requer permissão para editar traduções.",
	"admin.apply": "Aplicar traduções",
	"admin.apply_result.one": "{{written}} tradução guardada.",
	"admin.apply_result.other": "{{written}} traduções guardadas.",
	"admin.apply_skipped": "{{skipped}} ignoradas porque o texto foi preenchido entretanto.",
	"admin.apply_invalid": "{{invalid}} não guardadas; consulte as linhas assinaladas.",
	"admin.skipped_label": "Chaves ignoradas",
	"admin.apply_rejected.title": "Traduções não guardadas",
	"admin.apply_rejected.body": "As sugestões não puderam ser guardadas. Nada foi alterado. Tente novamente.",
	"admin.apply_unknown.title": "Resultado desconhecido",
	"admin.apply_unknown.body": "A resposta foi interrompida. Verifique a tabela antes de aplicar novamente.",
	"admin.apply_unknown.reconcile": "Recarregar sugestões",
	"admin.discard_failed": "A sugestão não foi descartada. Tente novamente.",
	"admin.row_invalid": "Esta sugestão não foi guardada. Edite-a ou descarte-a.",
	"admin.conflict.body": "Já está em curso uma tradução por IA para {{language}}. Aguarde que termine e inicie o bloco seguinte.",
	"admin.run.queued.title": "Tradução em fila",
	"admin.run.queued.body": "A execução começa em breve. Pode alterar o filtro ou sair desta página; a execução continua.",
	"admin.run.running.title": "A traduzir {{language}}",
	"admin.run.running.body": "{{processed}} de {{total}} textos processados. Pode alterar o filtro ou sair desta página; a execução continua.",
	"admin.run.finished.title": "Última execução concluída",
	"admin.run.finished.body": "{{generated}} sugestões criadas, {{skipped}} textos ignorados. Reveja-as na tabela de tradução.",
	"admin.run.partial.title": "Última execução parcialmente concluída",
	"admin.run.partial.body": "{{generated}} sugestões criadas; {{failed}} textos não puderam ser traduzidos. Inicie novamente para tentar o resto.",
	"admin.run.provider_stop.title": "Última execução interrompida",
	"admin.run.provider_stop.body": "O serviço de IA ficou indisponível após {{processed}} de {{total}} textos. As {{generated}} sugestões criadas antes são mantidas. Tente novamente mais tarde.",
	"admin.run.cancelled.title": "Última execução cancelada",
	"admin.run.cancelled.body": "Cancelada após {{processed}} de {{total}} textos. As {{generated}} sugestões criadas antes do cancelamento são mantidas.",
	"admin.run.failed.title": "Última execução falhou",
	"admin.run.failed.body": "A execução parou inesperadamente. As sugestões criadas antes são mantidas. Abra os detalhes da tarefa para o registo ou inicie novamente.",
	"review.title": "Sugestões para rever",
	"review.apply": "Aplicar",
	"review.apply_all": "Aplicar todas as {{count}}",
	"review.discard": "Descartar",
	"review.object": "Objeto",
	"review.value_label": "Tradução ({{language}})",
	"review.outcome": "{{written}} guardadas, {{skipped}} ignoradas porque já existe uma tradução, {{failed}} não guardadas.",
	"review.more": "Há mais sugestões à espera. Aparecem aqui depois de rever estas.",
	"review.type.object_type": "ObjectType",
	"review.type.object_type_attribute": "Atributo",
	"review.type.select_option": "Opção de seleção",
	"review.type.object_value": "Valor",
	"review.type.status": "Estado",
	"review.type.reference_type": "Tipo de referência",
	"schema.run.reviewed.body": "{{generated}} sugestões criadas. Todas foram revistas.",
	"error.conflict.title": "A tradução com IA não pode iniciar",
	"error.conflict.body": "A execução foi recusada. Se o plugin acabou de ser atualizado, um administrador tem de reiniciar primeiro o worker. Nada foi alterado."
}, D = ".aitr-panel{flex-direction:column;gap:8px;min-width:0;display:flex}.aitr-panel .aitr-helper{color:hsl(var(--muted-foreground));overflow-wrap:anywhere;margin:0;font-size:12px;line-height:16px}.aitr-panel .aitr-pending{color:hsl(var(--muted-foreground));align-items:center;gap:8px;margin:0;font-size:12px;line-height:16px;display:flex}.aitr-panel .aitr-spinner{flex:none;width:16px;height:16px}.aitr-panel .aitr-notice{border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--foreground));border-radius:8px;align-items:flex-start;gap:8px;padding:16px;font-size:12px;line-height:16px;display:flex}.aitr-panel .aitr-notice svg{flex:none;width:16px;height:16px}.aitr-panel .aitr-notice span{overflow-wrap:anywhere;min-width:0}.aitr-panel .aitr-error{border:1px solid hsl(var(--destructive) / .3);background:hsl(var(--destructive) / .1);border-radius:8px;flex-direction:column;gap:8px;padding:16px;display:flex}.aitr-panel .aitr-error-title{color:#b91c1c;outline:none;align-items:center;gap:8px;margin:0;font-size:12px;font-weight:600;line-height:16px;display:flex}.dark .aitr-panel .aitr-error-title{color:#f87171}.aitr-panel .aitr-error-title svg{flex:none;width:16px;height:16px}.aitr-panel .aitr-error-body{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:12px;line-height:16px}.aitr-panel .aitr-styles-refused{border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--foreground));border-radius:8px;padding:16px;font-size:12px;line-height:16px}@media (prefers-reduced-motion:no-preference){.aitr-panel .aitr-spinner{animation:1s linear infinite aitr-spin}}@keyframes aitr-spin{0%{transform:rotate(0)}to{transform:rotate(360deg)}}", O = "plugins/ai-translation";
`${O}`;
var k = `${O}/data/suggestions`, A = `${O}/data/generate`;
`${O}`;
var j = `${O}/data/runs`;
function M(e) {
	return `${O}/data/suggestions/${e}`;
}
`${O}`;
var N = `${O}/ui/candidates`, P = `${O}/ui/suggestions`, F = `${O}/ui/runs`, I = `${O}/ui/apply`;
function L(e) {
	return `${O}/ui/suggestions/${e}`;
}
var R = 55e3, z = 2e3, B = /* @__PURE__ */ new Set([
	"timeout",
	"unreachable",
	"rate_limited",
	"input_rejected",
	"invalid_result",
	"unexpected"
]);
function ee(e) {
	return B.has(e);
}
var te = {
	timeout: {
		titleKey: "error.timeout.title",
		title: "AI service unavailable",
		bodyKey: "error.timeout.body",
		body: "The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment."
	},
	unreachable: {
		titleKey: "error.unreachable.title",
		title: "AI service unavailable",
		bodyKey: "error.unreachable.body",
		body: "The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment."
	},
	rate_limited: {
		titleKey: "error.rate_limited.title",
		title: "AI service unavailable",
		bodyKey: "error.rate_limited.body",
		body: "The AI service could not be reached or did not answer in time. Nothing was changed. Try again in a moment."
	},
	not_configured: {
		titleKey: "error.not_configured.title",
		title: "AI translation is unavailable",
		bodyKey: "error.not_configured.body",
		body: "AI translation is not set up correctly. Ask an administrator to check the AI configuration. Manual translation still works."
	},
	permission: {
		titleKey: "error.permission.title",
		title: "Permission required",
		bodyKey: "error.permission.body",
		body: "You no longer have permission for this AI translation. Manual translation still works. Ask an administrator for access."
	},
	input_rejected: {
		titleKey: "error.input_rejected.title",
		title: "AI translation failed",
		bodyKey: "error.input_rejected.body",
		body: "The request stopped unexpectedly. Nothing was changed. Try again."
	},
	invalid_result: {
		titleKey: "error.invalid_result.title",
		title: "AI translation failed",
		bodyKey: "error.invalid_result.body",
		body: "The request stopped unexpectedly. Nothing was changed. Try again."
	},
	conflict: {
		titleKey: "error.conflict.title",
		title: "AI translation cannot start",
		bodyKey: "error.conflict.body",
		body: "The run was refused. If the plugin was just updated, an administrator has to restart the worker first. Nothing was changed."
	},
	unexpected: {
		titleKey: "error.unexpected.title",
		title: "AI translation failed",
		bodyKey: "error.unexpected.body",
		body: "The request stopped unexpectedly. Nothing was changed. Try again."
	}
};
function V(e) {
	let t = e?.response?.status, n = e?.response?.data?.detail?.code;
	return t === 401 ? null : t === 403 ? "permission" : t === 409 ? n === "already_running" ? "already_running" : "conflict" : t === 429 ? "rate_limited" : t === 503 ? n === "not_configured" ? "not_configured" : "unreachable" : t === 504 ? "timeout" : t === 502 ? "unreachable" : t === 422 ? n === "input_rejected" ? "input_rejected" : "invalid_result" : typeof t == "number" && t >= 500 || e?.response ? "unexpected" : e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT" ? "timeout" : "unreachable";
}
function H(e) {
	return typeof e == "string" && e.length > 0 || typeof e == "number" && Number.isFinite(e);
}
function U(e, t) {
	return `${e}\u0000${t}`;
}
function W(e) {
	if (!e || typeof e != "object") return null;
	let t = e.field, n = e.language_code, r = e.proposed_text, i = e.suggestion_id;
	return typeof t != "string" || t === "" || typeof n != "string" || n === "" || typeof r != "string" || r === "" || !H(i) ? null : {
		field: t,
		language: n,
		value: r,
		reference: i
	};
}
function G(e, t) {
	let n = new Set((Array.isArray(t) ? t : []).map((e) => U(e.field, e.language))), r = [];
	for (let t of Array.isArray(e) ? e : []) {
		let e = W(t);
		e && (n.size > 0 && !n.has(U(e.field, e.language)) || r.push(e));
	}
	return r;
}
async function K({ api: e, entityType: t, entityId: n } = {}) {
	try {
		let r = (await e.get("plugins/ai-translation/data/status", { params: {
			translation_type: t,
			entity_id: n
		} }))?.data ?? {};
		return r.available === !0 || typeof r.open_count == "number" && r.open_count > 0;
	} catch {
		return !1;
	}
}
function q({ api: e, requestScope: t, entityType: n, entityId: r, sessionId: i, scopeRevision: a, registerDraftHandlers: o, acceptDraft: s, getEligiblePairs: c, getSession: l, getRequestScope: u, onEvent: d } = {}) {
	let f = null;
	function p() {
		return f !== null;
	}
	function m() {
		if (typeof c != "function") return [];
		let e = c();
		return Array.isArray(e) ? e : [];
	}
	function h() {
		if (typeof l == "function") {
			let e = l();
			if (e && typeof e == "object") return e;
		}
		return {
			sessionId: i,
			scopeRevision: a
		};
	}
	function g() {
		if (typeof u == "function") {
			let e = u();
			if (e && typeof e == "object") return e;
		}
		return t;
	}
	function _(e, t) {
		let n = G(e, t);
		if (n.length === 0 || typeof s != "function") return {
			applied: [],
			skipped: [],
			rejected: []
		};
		let { sessionId: r, scopeRevision: i } = h();
		return s({
			sessionId: r,
			scopeRevision: i,
			proposals: n
		});
	}
	async function v() {
		try {
			return _((await e.get(k, { params: {
				translation_type: n,
				entity_id: r
			} }))?.data, m());
		} catch (e) {
			return V(e), {
				applied: [],
				skipped: [],
				rejected: []
			};
		}
	}
	async function y() {
		if (p()) return {
			ok: !1,
			reason: "pending"
		};
		let t = m();
		if (t.length === 0) return {
			ok: !1,
			reason: "no_eligible"
		};
		let i = g(), a = typeof i?.beginAttempt == "function", o = typeof i?.isCurrent == "function";
		if (!a && !o) return {
			ok: !1,
			reason: "invalid"
		};
		let s = a ? i.beginAttempt() : {
			signal: i.signal,
			isCurrent: () => i.isCurrent()
		};
		if (!s || typeof s.isCurrent != "function") return {
			ok: !1,
			reason: "invalid"
		};
		f = s;
		let c;
		try {
			c = await e.post(A, {
				translation_type: n,
				entity_id: r
			}, {
				signal: s?.signal,
				timeout: R,
				skipRateLimitRetry: !0
			});
		} catch (e) {
			if (f === s && (f = null), s?.signal?.aborted) return {
				ok: !1,
				reason: "aborted"
			};
			let t = V(e);
			return t === null ? {
				ok: !1,
				reason: "ignored"
			} : typeof s?.isCurrent != "function" || !s.isCurrent() ? {
				ok: !1,
				reason: "stale"
			} : (typeof d == "function" && d({
				type: "error",
				code: t
			}), {
				ok: !1,
				reason: "error",
				code: t
			});
		}
		if (f === s && (f = null), typeof s?.isCurrent != "function" || !s.isCurrent()) return {
			ok: !1,
			reason: "stale"
		};
		let l = _(c?.data, t);
		return typeof d == "function" && d({
			type: "generated",
			result: l
		}), {
			ok: !0,
			result: l
		};
	}
	function b() {
		return typeof o == "function" ? o({
			commitDraft: async ({ reference: t, value: i }) => {
				try {
					let a = (await e.post("plugins/ai-translation/data/apply", { items: [{
						suggestion_id: t,
						value: i
					}] }, {
						params: {
							translation_type: n,
							entity_id: r
						},
						skipRateLimitRetry: !0
					}))?.data ?? {}, o = (Array.isArray(a.results) ? a.results : []).find((e) => String(e.suggestion_id) === String(t));
					return o && (o.status === "written" || o.status === "skipped" || o.status === "invalid") ? {
						status: o.status,
						reason: o.reason ?? null
					} : a.written > 0 ? { status: "written" } : a.skipped > 0 ? { status: "skipped" } : { status: "invalid" };
				} catch {
					return { status: "invalid" };
				}
			},
			discardDraft: async ({ reference: t }) => {
				try {
					return await e.delete(M(t), { params: {
						translation_type: n,
						entity_id: r
					} }), !0;
				} catch {
					return !1;
				}
			}
		}) : () => {};
	}
	return {
		isPending: p,
		generate: y,
		loadExistingSuggestions: v,
		registerHandlers: b,
		currentEligible: m
	};
}
var J = `${O}/data/availability`, ne = `${O}/data/open-count`, Y = `${O}/data/schema-suggestions`, X = `${O}/data/schema-candidates`, re = [
	"object_type",
	"object_type_attribute",
	"select_option",
	"object_value",
	"status",
	"reference_type"
];
function ie(e) {
	if (!Array.isArray(e)) return [];
	let t = new Set(e);
	return re.filter((e) => t.has(e));
}
function ae(e, t) {
	if (!Array.isArray(e)) return null;
	let n = new Set(ie(t)), r = 0, i = 0;
	for (let t of e) t && n.has(t.translation_type) && (r += $(t.missing), i += $(t.waiting));
	return {
		missing: r,
		waiting: i,
		requestable: Math.max(0, r - i)
	};
}
function oe({ selected: e, summary: t } = {}) {
	return ie(e).length === 0 ? "none_selected" : t && t.requestable === 0 ? "nothing_missing" : null;
}
async function se({ api: e, schemaId: t } = {}) {
	try {
		let n = (await e.get(X, { params: { schema_id: t } }))?.data?.items;
		return {
			ok: !0,
			items: Array.isArray(n) ? n : []
		};
	} catch {
		return {
			ok: !1,
			items: null
		};
	}
}
var Z = /* @__PURE__ */ new Set([
	"finished",
	"partial",
	"provider_stop",
	"cancelled",
	"failed"
]);
function ce(e) {
	return Z.has(e);
}
var Q = {
	queued: "loader-circle",
	running: "loader-circle",
	finished: "circle-check",
	partial: "info",
	cancelled: "info",
	provider_stop: "circle-alert",
	failed: "circle-alert"
}, le = {
	finished: "success",
	provider_stop: "error",
	failed: "error"
};
function $(e) {
	return Number.isFinite(e) && e > 0 ? Math.floor(e) : 0;
}
function ue(e) {
	let t = typeof e?.outcome == "string" ? e.outcome : "running", n = Number.isFinite(e?.total) && e.total > 0 ? Math.floor(e.total) : null, r = t === "running" ? n === null ? "queued" : "running" : t;
	return {
		key: r,
		icon: Q[r] ?? "info",
		tone: le[r] ?? "neutral",
		processed: $(e?.attempted),
		total: n,
		determinate: n !== null,
		generated: $(e?.generated),
		skipped: $(e?.skipped),
		failed: $(e?.failed),
		startedAt: e?.started_at ?? null,
		taskId: e?.task_id ?? null
	};
}
function de({ api: e, kind: t = "schema", schemaId: n, targetLanguage: r, onEvent: i, schedule: a, cancel: o } = {}) {
	let s = typeof a == "function" ? a : (e, t) => setTimeout(e, t), c = typeof o == "function" ? o : (e) => clearTimeout(e), l = t === "ui" ? F : j, u = t === "ui" ? { target_language: r } : { schema_id: n }, d = null, f = !0, p = !1, m = null, h = !1, g = 0, _ = null;
	function v(e) {
		typeof i == "function" && i(e);
	}
	function y() {
		return m !== null && ce(m.outcome);
	}
	function b() {
		g > 0 ? (--g, h = !1) : (h = !0, g = 0, _ = null), m = null, v({
			type: "run",
			run: null
		});
	}
	function x() {
		d !== null && (c(d), d = null);
	}
	function S() {
		f = !0, x();
	}
	async function C() {
		if (p) return m;
		p = !0;
		try {
			let t = (await e.get(l, { params: u }))?.data ?? null;
			return t === null ? (b(), null) : g > 0 && _ !== null && String(t.task_id) !== String(_) ? (--g, h = !1, m) : (m = t, h = !1, g = 0, _ = null, v({
				type: "run",
				run: m
			}), m);
		} catch (e) {
			if (e?.response?.status === 404) return b(), null;
			let t = V(e);
			return v({
				type: "run_error",
				code: t
			}), (t === "permission" || t === null) && S(), m;
		} finally {
			p = !1;
		}
	}
	function w() {
		f || h || y() || (x(), d = s(() => {
			T();
		}, z));
	}
	async function T() {
		d = null, !f && (await C(), w());
	}
	async function E({ awaitRun: e = !1, taskId: t = null } = {}) {
		return x(), f = !1, h = !1, g = e ? 5 : 0, _ = e && t ? t : null, await T(), m;
	}
	async function D() {
		return f || !h || p || (await C(), m !== null && !y() && w()), m;
	}
	return {
		start: E,
		stop: S,
		load: C,
		resume: D,
		terminal: y,
		isIdle: () => h,
		getCurrent: () => m
	};
}
function fe(e, { doc: t, win: n } = {}) {
	if (typeof e?.resume != "function" || typeof t?.addEventListener != "function") return () => {};
	function r() {
		t.visibilityState !== "hidden" && e.resume();
	}
	t.addEventListener("visibilitychange", r);
	let i = typeof n?.addEventListener == "function";
	return i && n.addEventListener("focus", r), () => {
		typeof t.removeEventListener == "function" && t.removeEventListener("visibilitychange", r), i && typeof n.removeEventListener == "function" && n.removeEventListener("focus", r);
	};
}
function pe({ api: e, schemaId: t, onEvent: n } = {}) {
	let r = !1;
	async function i({ translationTypes: i } = {}) {
		let a = i === void 0 ? null : ie(i);
		if (i !== void 0 && a.length === 0) return {
			ok: !1,
			reason: "invalid"
		};
		if (r) return {
			ok: !1,
			reason: "pending"
		};
		r = !0;
		try {
			let r = (await e.post("/tasks/", {
				tasktype: "ai-translation.schema-bulk",
				schema_id: t,
				plugin_parameters: a ? { translation_types: a } : {},
				current_step: null
			}))?.data ?? null;
			return typeof n == "function" && n({
				type: "started",
				task: r
			}), {
				ok: !0,
				task: r
			};
		} catch (e) {
			let t = V(e);
			return t === null ? {
				ok: !1,
				reason: "ignored"
			} : {
				ok: !1,
				reason: "error",
				code: t
			};
		} finally {
			r = !1;
		}
	}
	return {
		start: i,
		isPending: () => r
	};
}
async function me({ api: e, schemaId: t } = {}) {
	let [n, r] = await Promise.allSettled([e.get(J), e.get(j, { params: { schema_id: t } })]);
	return n.status === "fulfilled" && n.value?.data?.available === !0 || r.status === "fulfilled";
}
function he({ language: e, namespace: t, namespaceIsNull: n, search: r } = {}) {
	let i = typeof e == "string" ? e.trim().toLowerCase() : "", a = typeof t == "string" && t.trim() !== "" ? t.trim() : null, o = typeof r == "string" && r.trim() !== "" ? r.trim() : null;
	return {
		target_language: i,
		namespace: a,
		namespace_is_null: a === null && !!n,
		q: o
	};
}
function ge(e) {
	let t = $(e?.eligible_total), n = $(e?.missing_total), r = "eligible";
	return n === 0 ? r = "none_missing" : t === 0 && (r = "missing_not_eligible"), {
		state: r,
		eligibleTotal: t,
		missingTotal: n,
		overCap: t > 100,
		hasMore: e?.has_more === !0
	};
}
async function _e({ api: e, language: t } = {}) {
	let n = typeof t == "string" ? t.trim().toLowerCase() : "";
	if (n === "" || n === "en") return !1;
	try {
		let t = (await e.get("plugins/ai-translation/ui/status", { params: { target_language: n } }))?.data ?? {};
		return t.available === !0 || $(t.open_count) > 0;
	} catch {
		return !1;
	}
}
function ve(e) {
	if (e && e.error) {
		let t = e.error, n = t?.response?.status, r = t?.response?.data?.detail?.code;
		if (r === "transaction_failed" || n === 409) return { status: "rejected" };
		if (r === "outcome_unknown" || n === 503 || n === void 0) return { status: "unknown" };
		let i = V(t);
		return i === null ? { status: "ignored" } : {
			status: "error",
			code: i
		};
	}
	let t = e?.response?.data ?? {};
	return {
		status: "confirmed",
		written: $(t.written),
		skipped: $(t.skipped),
		invalid: $(t.invalid),
		results: Array.isArray(t.results) ? t.results : []
	};
}
function ye(e) {
	if (!e || typeof e != "object" || !H(e.suggestion_id)) return null;
	let t = typeof e.key == "string" ? e.key : "";
	return t === "" ? null : {
		uiStringId: String(e.suggestion_id),
		namespace: typeof e.namespace == "string" && e.namespace !== "" ? e.namespace : null,
		key: t,
		codeDefault: typeof e.source_text == "string" ? e.source_text : "",
		reference: e.suggestion_id,
		value: typeof e.proposed_text == "string" ? e.proposed_text : ""
	};
}
function be({ api: e, getFilters: t, getScopeRevision: n, publishReview: r, leaveReview: i, refreshCatalog: a, onEvent: o, invalidReasonText: s, schedule: c, cancel: l } = {}) {
	let u = typeof c == "function" ? c : (e, t) => setTimeout(e, t), d = typeof l == "function" ? l : (e) => clearTimeout(e), f = null, p = !1, m = !1, h = !1, g = null, _ = 0, v = null, y = null, b = /* @__PURE__ */ new Map(), x = /* @__PURE__ */ new Set();
	function S(e) {
		typeof o == "function" && o(e);
	}
	function C() {
		return he((typeof t == "function" ? t() : {}) ?? {});
	}
	function w() {
		return typeof n == "function" ? n() : 0;
	}
	function T() {
		return v;
	}
	function E(t) {
		return f === null && (f = de({
			api: e,
			kind: "ui",
			targetLanguage: t,
			onEvent: (e) => {
				e.type === "run" ? (y = e.run, S({
					type: "run",
					run: e.run
				}), e.run && ce(e.run.outcome) && (f.stop(), m && $(e.run.generated) > 0 && (m = !1, k({
					focus: !1,
					automatic: !0
				})))) : e.type === "run_error" && S({
					type: "run_error",
					code: e.code
				});
			},
			schedule: u,
			cancel: d
		})), f;
	}
	async function D() {
		let t = C(), [n, r] = await Promise.allSettled([e.get(N, { params: t }), e.get(P, { params: t })]);
		return g = n.status === "fulfilled" ? ge(n.value?.data) : null, _ = r.status === "fulfilled" ? $(r.value?.data?.total) : 0, S({
			type: "eligibility",
			eligibility: g,
			suggestionTotal: _
		}), {
			eligibility: g,
			suggestionTotal: _
		};
	}
	async function O() {
		if (p) return {
			ok: !1,
			reason: "pending"
		};
		p = !0;
		try {
			let t = C(), n = (await e.post("/tasks/", {
				tasktype: "ai-translation.ui-bulk",
				plugin_parameters: t,
				current_step: null
			}))?.data ?? null;
			m = !0;
			let r = E(t.target_language);
			return r.stop(), r.start({
				awaitRun: !0,
				taskId: n?.id ?? null
			}), S({
				type: "started",
				task: n
			}), {
				ok: !0,
				task: n
			};
		} catch (e) {
			let t = V(e);
			return t === null ? {
				ok: !1,
				reason: "ignored"
			} : (S({
				type: "start_error",
				code: t
			}), {
				ok: !1,
				reason: "error",
				code: t
			});
		} finally {
			p = !1;
		}
	}
	async function k({ focus: t = !0, automatic: n = !1 } = {}) {
		let a = C(), o = w(), c;
		try {
			c = await e.get(P, { params: a });
		} catch (e) {
			return {
				ok: !1,
				reason: "error",
				code: V(e)
			};
		}
		if (w() !== o) return {
			ok: !1,
			reason: "stale"
		};
		let l = (Array.isArray(c?.data?.items) ? c.data.items : []).map(ye).filter(Boolean);
		if (l.length === 0) return v = null, typeof i == "function" && i(), S({
			type: "review_empty",
			automatic: n
		}), {
			ok: !0,
			count: 0,
			rows: [],
			drafts: [],
			total: 0
		};
		let u = l.map((e) => ({
			uiStringId: e.uiStringId,
			namespace: e.namespace,
			key: e.key,
			codeDefault: e.codeDefault
		})), d = typeof s == "function" ? s() : null, f = l.map((e) => ({
			uiStringId: e.uiStringId,
			value: b.has(e.uiStringId) ? b.get(e.uiStringId) : e.value,
			reference: e.reference,
			...x.has(e.uiStringId) ? {
				invalid: !0,
				reasonText: d
			} : {}
		})), p = $(c?.data?.total) || l.length;
		return (typeof r != "function" || r({
			scopeRevision: o,
			rows: u,
			drafts: f,
			total: p,
			onDraftChange: A,
			onDiscard: R
		})) === !1 ? (v = null, {
			ok: !1,
			reason: "stale"
		}) : (v = {
			rows: u.map((e, t) => ({
				...e,
				draft: { ...f[t] }
			})),
			drafts: f,
			total: p
		}, S({
			type: "review",
			count: l.length,
			total: p,
			focus: t,
			automatic: n
		}), {
			ok: !0,
			count: l.length,
			rows: u,
			drafts: f,
			total: p
		});
	}
	function A(e, t) {
		if (!H(e)) return !1;
		let n = String(e), r = typeof t == "string" ? t : "";
		if (b.set(n, r), v) {
			let e = v.drafts.find((e) => e.uiStringId === n);
			e && (e.value = r);
			let t = v.rows.find((e) => e.uiStringId === n);
			t?.draft && (t.draft.value = r);
		}
		return !0;
	}
	function j(e) {
		if (!v) return;
		let t = /* @__PURE__ */ new Set();
		x.clear();
		for (let n of Array.isArray(e) ? e : []) n?.status === "written" || n?.status === "skipped" ? t.add(String(n.suggestion_id)) : n?.status === "invalid" && x.add(String(n.suggestion_id));
		t.size !== 0 && (t.forEach((e) => b.delete(e)), v.rows = v.rows.filter((e) => !t.has(e.uiStringId)), v.drafts = v.drafts.filter((e) => !t.has(e.uiStringId)), v.total = Math.max(0, v.total - t.size), v.rows.length === 0 && (v = null));
	}
	async function M() {
		if (h) return { status: "blocked" };
		if (!v || v.drafts.length === 0) return { status: "empty" };
		let t = C(), n = v.drafts.map((e) => ({
			suggestion_id: e.reference,
			value: e.value
		})), r, i;
		try {
			r = await e.post(I, {
				target_language: t.target_language,
				namespace: t.namespace,
				namespace_is_null: t.namespace_is_null,
				q: t.q,
				items: n
			}, { skipRateLimitRetry: !0 });
		} catch (e) {
			i = e;
		}
		let o = ve(i ? { error: i } : { response: r });
		return o.status === "confirmed" ? (S({
			type: "applied",
			written: o.written,
			skipped: o.skipped,
			invalid: o.invalid
		}), typeof a == "function" && a(), j(o.results), k({ focus: !1 }), o) : o.status === "unknown" ? (h = !0, S({ type: "apply_unknown" }), o) : o.status === "rejected" ? (S({ type: "apply_rejected" }), o) : (S({
			type: "apply_error",
			code: o.code
		}), o);
	}
	async function F() {
		return h = !1, await D(), v && await k({ focus: !1 }), { ok: !0 };
	}
	async function R(t) {
		if (!H(t)) return !1;
		let n = String(t), r = C();
		try {
			await e.delete(L(t), { params: {
				target_language: r.target_language,
				namespace: r.namespace,
				namespace_is_null: r.namespace_is_null,
				q: r.q
			} });
		} catch {
			return S({
				type: "discard_error",
				uiStringId: n
			}), !1;
		}
		return b.delete(n), x.delete(n), v && (v.rows = v.rows.filter((e) => e.uiStringId !== n), v.drafts = v.drafts.filter((e) => e.uiStringId !== n), v.total = Math.max(0, v.total - 1), v.rows.length === 0 && (v = null)), S({
			type: "discarded",
			uiStringId: n
		}), !0;
	}
	function z() {
		f && f.stop();
	}
	function B() {
		return f ? f.resume() : Promise.resolve(null);
	}
	function ee() {
		v = null, b.clear(), x.clear();
	}
	return {
		load: D,
		start: O,
		enterReview: k,
		setDraftValue: A,
		apply: M,
		reconcile: F,
		discard: R,
		stop: z,
		resume: B,
		clearReview: ee,
		blocked: () => h,
		getEligibility: () => g,
		getSuggestionTotal: () => _,
		getReview: T,
		getRun: () => y
	};
}
// ../plugins/ai-translation/frontend/PanelAction.jsx
var xe = "ai-translation", Se = /* @__PURE__ */ new Set(["status", "reference_type"]);
function Ce() {
	if (typeof document > "u") return !1;
	let e = document.querySelector("style[data-plugin-owner=\"ai-translation\"][data-plugin-style=\"panel\"]");
	return !!e && e.sheet === null;
}
function we({ entityType: t, entityId: r, targetLanguages: o = [], eligiblePairs: s = [], sessionId: c, scopeRevision: l, canWrite: u, requestScope: f, registerDraftHandlers: _, acceptDraft: b, getCurrentEligiblePairs: x, onPresenceChanged: S, disabled: C }) {
	let { t: w } = d(xe), [T, E] = g(null), [O, k] = g("idle"), [A, j] = g(null), [M, N] = g(!1), P = h(!0), F = h(null), I = h(null), L = h(null);
	L.current = {
		requestScope: f,
		acceptDraft: b,
		registerDraftHandlers: _,
		getCurrentEligiblePairs: x,
		sessionId: c,
		scopeRevision: l
	};
	let R = h(null);
	R.current === null && (R.current = q({
		api: i,
		entityType: t,
		entityId: r,
		getRequestScope: () => L.current.requestScope,
		acceptDraft: (e) => L.current.acceptDraft?.(e),
		registerDraftHandlers: (e) => L.current.registerDraftHandlers?.(e),
		getEligiblePairs: () => L.current.getCurrentEligiblePairs?.() ?? [],
		getSession: () => ({
			sessionId: L.current.sessionId,
			scopeRevision: L.current.scopeRevision
		}),
		onEvent: (e) => I.current?.(e)
	}));
	let z = R.current;
	I.current = (e) => {
		P.current && (e.type === "error" ? (k(e.code === "already_running" ? "conflict" : "error"), j(e.code)) : e.type === "generated" && (k("idle"), j(null)));
	}, p(() => (P.current = !0, () => {
		P.current = !1;
	}), []), p(() => {
		let e = a(xe, "panel", D);
		return (!e?.ok || Ce()) && N(!0), () => e?.release?.();
	}, []), p(() => {
		let e = z.registerHandlers();
		return () => {
			typeof e == "function" && e();
		};
	}, [
		z,
		c,
		l
	]), p(() => {
		let e = !1;
		return i.get("plugins/ai-translation/data/status", { params: {
			translation_type: t,
			entity_id: r
		} }).then((t) => {
			e || E(t?.data?.available === !0);
		}).catch(() => {
			e || E(!1);
		}), z.loadExistingSuggestions(), () => {
			e = !0;
		};
	}, [
		z,
		t,
		r,
		c,
		l
	]), p(() => {
		O === "error" && F.current?.focus();
	}, [O]);
	let B = Se.has(t), V = o.length === 0, H = B && V, U = s.length === 0, W = O === "pending", G = m(() => A ? te[A] : null, [A]), K = async () => {
		if (W) return;
		k("pending"), j(null);
		let e = await z.generate();
		P.current && (e.ok || e.reason === "error" || e.reason === "pending" || e.reason !== "aborted" && e.reason !== "stale" && e.reason !== "ignored" && k("idle"));
	};
	if (M) return /* @__PURE__ */ v("div", {
		className: "aitr-panel",
		"data-testid": "plugin-ai-translation-panel",
		children: /* @__PURE__ */ v("div", {
			className: "aitr-styles-refused",
			role: "alert",
			"data-testid": "plugin-ai-translation-styles-refused",
			children: w("styles.refused", "The AI translation action could not be styled, so it is not shown. Manual translation still works.")
		})
	});
	let J = T === !0;
	return !J && O === "idle" && !G && !H ? null : /* @__PURE__ */ y("div", {
		className: "aitr-panel",
		"data-testid": "plugin-ai-translation-panel",
		children: [
			J && /* @__PURE__ */ v(e, {
				type: "button",
				variant: "outline",
				size: "sm",
				leftIcon: "sparkles",
				className: "h-auto min-h-8 whitespace-normal font-semibold",
				"data-testid": "plugin-ai-translation-generate",
				disabled: W || V || U,
				loading: W,
				onClick: K,
				children: w("panel.action", "Translate with AI")
			}),
			H && /* @__PURE__ */ v("p", {
				className: "aitr-helper",
				"data-testid": "plugin-ai-translation-prerequisite",
				children: w("panel.prerequisite", "Enable at least two languages for this schema to translate statuses and reference types.")
			}),
			!H && !V && U && J && /* @__PURE__ */ v("p", {
				className: "aitr-helper",
				"data-testid": "plugin-ai-translation-nothing-eligible",
				children: w("panel.nothing_eligible", "All target fields are filled or edited. Nothing to suggest.")
			}),
			W && /* @__PURE__ */ y("p", {
				className: "aitr-pending",
				role: "status",
				"aria-live": "polite",
				"data-testid": "plugin-ai-translation-pending",
				children: [/* @__PURE__ */ v(n, {
					name: "loader-circle",
					className: "aitr-spinner",
					"aria-hidden": "true"
				}), w("panel.pending", "Preparing suggestions…")]
			}),
			O === "conflict" && /* @__PURE__ */ y("div", {
				className: "aitr-notice",
				role: "status",
				"data-testid": "plugin-ai-translation-conflict",
				children: [/* @__PURE__ */ v(n, {
					name: "clock",
					"aria-hidden": "true"
				}), /* @__PURE__ */ v("span", { children: w("panel.conflict", "Suggestions for this item or its schema are already being prepared. Try again when that has finished.") })]
			}),
			O === "error" && G && /* @__PURE__ */ y("div", {
				className: "aitr-error",
				role: "alert",
				"data-testid": "plugin-ai-translation-error",
				children: [
					/* @__PURE__ */ y("p", {
						ref: F,
						tabIndex: -1,
						className: "aitr-error-title",
						"data-testid": "plugin-ai-translation-error-title",
						children: [/* @__PURE__ */ v(n, {
							name: "circle-alert",
							"aria-hidden": "true"
						}), w(G.titleKey, G.title)]
					}),
					/* @__PURE__ */ v("p", {
						className: "aitr-error-body",
						children: w(G.bodyKey, G.body)
					}),
					ee(A) && /* @__PURE__ */ v(e, {
						type: "button",
						variant: "outline",
						size: "sm",
						className: "h-auto min-h-8 whitespace-normal font-semibold",
						"data-testid": "plugin-ai-translation-retry",
						onClick: K,
						children: w("error.try_again", "Try again")
					})
				]
			})
		]
	});
}
// ../plugins/ai-translation/frontend/RunStatus.jsx
var Te = "ai-translation", Ee = {
	schema: {
		queued: {
			title: "Translation queued",
			body: "The run starts shortly. You can leave this page."
		},
		running: {
			title: "Translation running",
			body: "{{processed}} of {{total}} items processed. You can leave this page; the run continues."
		},
		finished: {
			title: "Last run finished",
			body: "{{generated}} suggestions created, {{skipped}} items skipped. Review and save them in the list below."
		},
		partial: {
			title: "Last run partly finished",
			body: "{{generated}} suggestions created; {{failed}} items could not be translated. Review the created suggestions in the list below. Start again to retry the rest."
		},
		provider_stop: {
			title: "Last run stopped",
			body: "The AI service was unavailable after {{processed}} of {{total}} items. {{generated}} suggestions created before that are kept. Try again later."
		},
		cancelled: {
			title: "Last run cancelled",
			body: "Cancelled after {{processed}} of {{total}} items. {{generated}} suggestions created before cancelling are kept."
		},
		failed: {
			title: "Last run failed",
			body: "The run stopped unexpectedly. Suggestions created before that are kept. Open the task details for the log, or start again."
		}
	},
	admin: {
		queued: {
			title: "Translation queued",
			body: "The run starts shortly. You can change the filter or leave this page; the run continues."
		},
		running: {
			title: "Translating {{language}}",
			body: "{{processed}} of {{total}} texts processed. You can change the filter or leave this page; the run continues."
		},
		finished: {
			title: "Last run finished",
			body: "{{generated}} suggestions created, {{skipped}} texts skipped. Review them in the translation table."
		},
		partial: {
			title: "Last run partly finished",
			body: "{{generated}} suggestions created; {{failed}} texts could not be translated. Start again to retry the rest."
		},
		provider_stop: {
			title: "Last run stopped",
			body: "The AI service was unavailable after {{processed}} of {{total}} texts. {{generated}} suggestions created before that are kept. Try again later."
		},
		cancelled: {
			title: "Last run cancelled",
			body: "Cancelled after {{processed}} of {{total}} texts. {{generated}} suggestions created before cancelling are kept."
		},
		failed: {
			title: "Last run failed",
			body: "The run stopped unexpectedly. Suggestions created before that are kept. Open the task details for the log, or start again."
		}
	}
};
function De(e, t) {
	return {
		processed: e.processed,
		total: e.total ?? e.processed,
		generated: e.generated,
		skipped: e.skipped,
		failed: e.failed,
		language: t
	};
}
var Oe = /* @__PURE__ */ new Set([
	"partial",
	"provider_stop",
	"failed"
]);
function ke({ run: e, surface: t = "schema", languageName: r = "", openCount: i = null }) {
	let { t: a } = d(Te), l = s("tasks", "read"), u = c(), f = ue(e), p = Ee[t] ?? Ee.schema, m = p[f.key] ?? p.running, h = t === "admin" ? "admin.run" : "schema.run", g = De(f, r), _ = o(a(`${h}.${f.key}.title`, m.title), g), x = t === "schema" && i === 0 && f.generated > 0 && (f.key === "finished" || f.key === "partial") ? o(a("schema.run.reviewed.body", "{{generated}} suggestions created. All of them have been reviewed."), g) : o(a(`${h}.${f.key}.body`, m.body), g), S = f.tone === "error" ? "aitr-run-title aitr-run-title-error" : "aitr-run-title";
	return /* @__PURE__ */ y("div", {
		className: "aitr-run",
		"data-testid": `plugin-ai-translation-run-${t}`,
		children: [
			/* @__PURE__ */ y("p", {
				className: S,
				role: "status",
				"aria-live": "polite",
				children: [/* @__PURE__ */ v(n, {
					name: f.icon,
					className: "aitr-run-icon",
					"aria-hidden": "true"
				}), _]
			}),
			/* @__PURE__ */ v("p", {
				className: "aitr-run-body",
				children: x
			}),
			f.determinate && (f.key === "running" || f.key === "queued") && /* @__PURE__ */ v("div", {
				className: "aitr-run-bar",
				role: "progressbar",
				"aria-valuenow": f.processed,
				"aria-valuemin": 0,
				"aria-valuemax": f.total,
				"data-testid": `plugin-ai-translation-run-bar-${t}`,
				children: /* @__PURE__ */ v("span", {
					className: "aitr-run-bar-fill",
					style: { width: `${Math.min(100, Math.round(f.processed / f.total * 100))}%` }
				})
			}),
			f.startedAt && /* @__PURE__ */ v("p", {
				className: "aitr-run-started",
				children: o(a("run.started", "Started {{datetime}}"), { datetime: u(f.startedAt) })
			}),
			f.taskId && l && Oe.has(f.key) && /* @__PURE__ */ v(b, {
				className: "aitr-run-link",
				to: `/tasks/${f.taskId}`,
				"data-testid": `plugin-ai-translation-task-link-${t}`,
				children: a("run.task_link", "Open task details")
			})
		]
	});
}
// ../plugins/ai-translation/frontend/SchemaReview.jsx
var Ae = "ai-translation", je = {
	object_type: "ObjectType",
	object_type_attribute: "Attribute",
	select_option: "Select option",
	object_value: "Value",
	status: "Status",
	reference_type: "Reference type"
}, Me = {
	object_type: ["object-types"],
	object_type_attribute: ["object-type-attributes"],
	select_option: ["object-type-attributes"],
	object_value: ["objects"],
	status: ["statuses"],
	reference_type: ["reference-types"]
};
function Ne(e) {
	return {
		translation_type: e.translation_type,
		entity_id: e.entity_id
	};
}
function Pe({ item: e }) {
	let { t } = d(Ae), n = l(e.object_id ?? void 0), r = u(e.object_id ? void 0 : e.object_type_id ?? void 0), i = t(`review.type.${e.translation_type}`, je[e.translation_type] ?? e.translation_type);
	return e.object_id ? /* @__PURE__ */ y("span", {
		className: "aitr-review-owner",
		children: [/* @__PURE__ */ v(b, {
			to: `/browse/objects/${e.object_id}`,
			className: "aitr-review-link",
			children: n.data?.name ?? t("review.object", "Object")
		}), /* @__PURE__ */ v("span", {
			className: "aitr-review-type",
			children: i
		})]
	}) : e.object_type_id ? /* @__PURE__ */ y("span", {
		className: "aitr-review-owner",
		children: [/* @__PURE__ */ v(b, {
			to: `/browse/object-types/${e.object_type_id}`,
			className: "aitr-review-link",
			children: r.data?.name ?? t("review.type.object_type", "ObjectType")
		}), /* @__PURE__ */ v("span", {
			className: "aitr-review-type",
			children: i
		})]
	}) : /* @__PURE__ */ v("span", {
		className: "aitr-review-owner",
		children: /* @__PURE__ */ v("span", {
			className: "aitr-review-type",
			children: i
		})
	});
}
function Fe({ schemaId: t, reloadKey: a, onChanged: s }) {
	let { t: c } = d(Ae), l = x(), [u, m] = g(null), [_, b] = g(!1), [S, C] = g({}), [w, T] = g(!1), [E, D] = g(null), k = h(!0);
	p(() => (k.current = !0, () => {
		k.current = !1;
	}), []);
	let A = f(async () => {
		if (t) try {
			let e = await i.get(Y, { params: { schema_id: t } });
			if (!k.current) return;
			m(e?.data?.items ?? []), b(e?.data?.has_more === !0);
		} catch {
			k.current && m(null);
		}
	}, [t]);
	p(() => {
		A();
	}, [A, a]);
	let j = (e) => S[e.suggestion_id] ?? e.proposed_text, M = async (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) {
			let e = j(n).trim();
			if (!e) continue;
			let r = `${n.translation_type}:${n.entity_id}`;
			t.has(r) || t.set(r, {
				item: n,
				entries: []
			}), t.get(r).entries.push({
				suggestion_id: n.suggestion_id,
				value: e
			});
		}
		if (t.size === 0) return;
		T(!0), D(null);
		let n = 0, r = 0, a = 0;
		for (let { item: e, entries: o } of t.values()) try {
			let t = await i.post(`${O}/data/apply`, { items: o }, { params: Ne(e) }), s = t?.data?.written ?? 0;
			n += s;
			let c = Me[e.translation_type];
			s > 0 && (l.invalidateQueries({ queryKey: ["translations", {
				translationType: e.translation_type,
				entityId: e.entity_id
			}] }), c && l.invalidateQueries({ queryKey: c })), r += t?.data?.skipped ?? 0, a += t?.data?.invalid ?? 0;
		} catch {
			a += o.length;
		}
		k.current && (T(!1), D({
			written: n,
			skipped: r,
			failed: a
		}), await A(), s?.());
	}, N = async (e) => {
		T(!0), D(null);
		try {
			await i.delete(`${O}/data/suggestions/${e.suggestion_id}`, { params: Ne(e) });
		} catch {
			k.current && D({
				written: 0,
				skipped: 0,
				failed: 1
			});
		}
		k.current && (T(!1), await A(), s?.());
	};
	if (!u || u.length === 0 && !E) return null;
	let P = u.filter((e) => e.can_update);
	return /* @__PURE__ */ y("div", {
		className: "aitr-review",
		"data-testid": "plugin-ai-translation-schema-review",
		children: [
			/* @__PURE__ */ y("div", {
				className: "aitr-review-head",
				children: [/* @__PURE__ */ v("p", {
					className: "aitr-review-title",
					children: c("review.title", "Suggestions to review")
				}), P.length > 1 && /* @__PURE__ */ v(e, {
					type: "button",
					variant: "outline",
					size: "sm",
					className: "h-auto min-h-8 whitespace-normal font-semibold",
					"data-testid": "plugin-ai-translation-review-apply-all",
					disabled: w,
					loading: w,
					onClick: () => M(P),
					children: o(c("review.apply_all", "Apply all {{count}}"), { count: P.length })
				})]
			}),
			E && /* @__PURE__ */ v("p", {
				className: "aitr-review-outcome",
				role: "status",
				"data-testid": "plugin-ai-translation-review-outcome",
				children: o(c("review.outcome", "{{written}} saved, {{skipped}} skipped because a translation already exists, {{failed}} not saved."), E)
			}),
			u.length > 0 && /* @__PURE__ */ v("ul", {
				className: "aitr-review-list",
				children: u.map((t) => /* @__PURE__ */ y("li", {
					className: "aitr-review-row",
					"data-testid": "plugin-ai-translation-review-row",
					children: [
						/* @__PURE__ */ v(Pe, { item: t }),
						/* @__PURE__ */ v("span", {
							className: "aitr-review-source",
							title: t.source_text ?? "",
							children: t.source_text
						}),
						/* @__PURE__ */ v("span", {
							className: "aitr-review-lang",
							children: t.language_code.toUpperCase()
						}),
						/* @__PURE__ */ v(r, {
							"aria-label": o(c("review.value_label", "Translation ({{language}})"), { language: t.language_code.toUpperCase() }),
							className: "aitr-review-input",
							value: j(t),
							disabled: w || !t.can_update,
							onChange: (e) => C((n) => ({
								...n,
								[t.suggestion_id]: e.target.value
							}))
						}),
						/* @__PURE__ */ y("span", {
							className: "aitr-review-actions",
							children: [/* @__PURE__ */ v(e, {
								type: "button",
								variant: "outline",
								size: "sm",
								leftIcon: "check",
								"data-testid": "plugin-ai-translation-review-apply",
								disabled: w || !t.can_update || !j(t).trim(),
								onClick: () => M([t]),
								children: c("review.apply", "Apply")
							}), /* @__PURE__ */ v(e, {
								type: "button",
								variant: "ghost",
								size: "sm",
								"data-testid": "plugin-ai-translation-review-discard",
								"aria-label": c("review.discard", "Discard"),
								title: c("review.discard", "Discard"),
								disabled: w || !t.can_update,
								onClick: () => N(t),
								children: /* @__PURE__ */ v(n, {
									name: "x",
									"aria-hidden": "true"
								})
							})]
						})
					]
				}, t.suggestion_id))
			}),
			_ && /* @__PURE__ */ v("p", {
				className: "aitr-helper",
				"data-testid": "plugin-ai-translation-review-more",
				children: c("review.more", "More suggestions are waiting. They appear here once these are reviewed.")
			})
		]
	});
}
// ../plugins/ai-translation/frontend/schema.css?inline
var Ie = ".aitr-schema{flex-direction:column;gap:16px;min-width:0;display:flex}.aitr-schema .aitr-intro{max-width:65ch;color:hsl(var(--muted-foreground));margin:0;font-size:14px;line-height:20px}.aitr-schema .aitr-open-count{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:14px;line-height:20px}.aitr-schema .aitr-helper{color:hsl(var(--muted-foreground));overflow-wrap:anywhere;margin:0;font-size:12px;line-height:16px}.aitr-schema .aitr-empty{border:1px solid hsl(var(--border));background:hsl(var(--card));border-radius:8px;flex-direction:column;gap:4px;padding:16px;display:flex}.aitr-schema .aitr-empty-title{color:hsl(var(--foreground));margin:0;font-size:14px;font-weight:600;line-height:20px}.aitr-schema .aitr-empty-body{color:hsl(var(--muted-foreground));margin:0;font-size:14px;line-height:20px}.aitr-schema .aitr-actions{flex-direction:column;align-items:flex-start;gap:8px;display:flex}.aitr-schema .aitr-kinds{border:0;flex-direction:column;gap:8px;min-width:0;margin:0;padding:0;display:flex}.aitr-schema .aitr-kinds-legend{color:hsl(var(--foreground));margin:0 0 8px;padding:0;font-size:14px;font-weight:600;line-height:20px}.aitr-schema .aitr-kinds-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 16px;display:grid}.aitr-schema .aitr-missing{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:14px;line-height:20px}.aitr-schema .aitr-notice{border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--foreground));border-radius:8px;align-items:flex-start;gap:8px;padding:16px;font-size:14px;line-height:20px;display:flex}.aitr-schema .aitr-notice svg{flex:none;width:16px;height:16px}.aitr-schema .aitr-notice span{overflow-wrap:anywhere;min-width:0}.aitr-schema .aitr-error{border:1px solid hsl(var(--destructive) / .3);background:hsl(var(--destructive) / .1);border-radius:8px;flex-direction:column;gap:8px;padding:16px;display:flex}.aitr-schema .aitr-error-title{color:#b91c1c;outline:none;align-items:center;gap:8px;margin:0;font-size:14px;font-weight:600;line-height:20px;display:flex}.dark .aitr-schema .aitr-error-title{color:#f87171}.aitr-schema .aitr-error-title svg{flex:none;width:16px;height:16px}.aitr-schema .aitr-error-body{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:14px;line-height:20px}.aitr-schema .aitr-styles-refused{border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--foreground));border-radius:8px;padding:16px;font-size:14px;line-height:20px}.aitr-schema .aitr-run{border:1px solid hsl(var(--border));background:hsl(var(--card));border-radius:8px;flex-direction:column;gap:8px;padding:16px;display:flex}.aitr-schema .aitr-run-title{color:hsl(var(--foreground));align-items:center;gap:8px;margin:0;font-size:14px;font-weight:600;line-height:20px;display:flex}.aitr-schema .aitr-run-title-error{color:#b91c1c}.dark .aitr-schema .aitr-run-title-error{color:#f87171}.aitr-schema .aitr-run-icon{flex:none;width:16px;height:16px}.aitr-schema .aitr-run-body{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:14px;line-height:20px}.aitr-schema .aitr-run-bar{background:hsl(var(--muted));border-radius:9999px;width:180px;max-width:100%;height:6px;overflow:hidden}.aitr-schema .aitr-run-bar-fill{background:hsl(var(--primary));height:100%;display:block}.aitr-schema .aitr-run-started{color:hsl(var(--muted-foreground));margin:0;font-size:12px;line-height:16px}.aitr-schema .aitr-run-link{color:hsl(var(--primary));align-self:flex-start;font-size:14px;line-height:20px}.aitr-schema .aitr-run-link:focus-visible{outline:2px solid hsl(var(--ring));outline-offset:2px}@media (prefers-reduced-motion:no-preference){.aitr-schema .aitr-run-icon{animation:1s linear infinite aitr-schema-spin}}@keyframes aitr-schema-spin{0%{transform:rotate(0)}to{transform:rotate(360deg)}}@media (width<=640px){.aitr-schema .aitr-actions{align-items:stretch}}.aitr-schema .aitr-review{flex-direction:column;gap:8px;min-width:0;display:flex}.aitr-schema .aitr-review-head{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;display:flex}.aitr-schema .aitr-review-title{color:hsl(var(--foreground));margin:0;font-size:14px;font-weight:600;line-height:20px}.aitr-schema .aitr-review-outcome{color:hsl(var(--foreground));margin:0;font-size:14px;line-height:20px}.aitr-schema .aitr-review-list{border:1px solid hsl(var(--border));border-radius:8px;flex-direction:column;margin:0;padding:0;list-style:none;display:flex}.aitr-schema .aitr-review-row{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto minmax(0,1.5fr) auto;align-items:center;gap:8px;padding:8px 12px;font-size:14px;line-height:20px;display:grid}.aitr-schema .aitr-review-row+.aitr-review-row{border-top:1px solid hsl(var(--border))}@media (width<=720px){.aitr-schema .aitr-review-row{grid-template-columns:minmax(0,1fr) auto}}.aitr-schema .aitr-review-owner{flex-direction:column;min-width:0;display:flex}.aitr-schema .aitr-review-link{color:hsl(var(--primary));overflow-wrap:anywhere}.aitr-schema .aitr-review-link:hover{text-decoration:underline}.aitr-schema .aitr-review-type{color:hsl(var(--muted-foreground));font-size:12px;line-height:16px}.aitr-schema .aitr-review-source{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:hsl(var(--muted-foreground));overflow:hidden}.aitr-schema .aitr-review-lang{color:hsl(var(--muted-foreground));font-size:12px;font-weight:600;line-height:16px}.aitr-schema .aitr-review-input{min-width:0}.aitr-schema .aitr-review-actions{align-items:center;gap:4px;display:flex}.aitr-schema .aitr-review-actions svg{width:16px;height:16px}", Le = "ai-translation";
function Re() {
	if (typeof document > "u") return !1;
	let e = document.querySelector("style[data-plugin-owner=\"ai-translation\"][data-plugin-style=\"schema\"]");
	return !!e && e.sheet === null;
}
function ze({ schema: r }) {
	let { t: s } = d(Le), c = r?.id ?? null, l = r?.default_language_code ?? null, [u, b] = g(null), [x, S] = g(null), [C, w] = g([]), [T, E] = g(null), [D, O] = g("idle"), [k, A] = g(null), [j, M] = g(!1), [N, P] = g(() => [...re]), [F, I] = g(null), [L, R] = g("loading"), z = h(!0), B = h(null), V = h(0), H = h(!1), [U, W] = g(c);
	U !== c && (W(c), E(null), O("idle"), A(null), P([...re]), I(null), R("loading"), H.current = !1);
	let G = m(() => c ? de({
		api: i,
		kind: "schema",
		schemaId: c,
		onEvent: (e) => {
			z.current && (e.type === "run" ? E(e.run) : e.type === "run_error" && E(null));
		}
	}) : null, [c]), K = m(() => c ? pe({
		api: i,
		schemaId: c
	}) : null, [c]);
	p(() => (z.current = !0, () => {
		z.current = !1;
	}), []);
	let q = f(() => {
		if (!c) return;
		let e = V.current + 1;
		V.current = e, se({
			api: i,
			schemaId: c
		}).then((t) => {
			z.current && e === V.current && (t.ok ? (I(t.items), R("ready")) : (I(null), R("error")));
		});
	}, [c]);
	p(() => {
		c && (R("loading"), q());
	}, [c, q]), p(() => {
		T && (ce(T.outcome) ? H.current && (H.current = !1, q()) : H.current = !0);
	}, [T, q]), p(() => {
		let e = a(Le, "schema", Ie);
		return (!e?.ok || Re()) && M(!0), () => e?.release?.();
	}, []), p(() => {
		if (!c) return;
		let e = !1;
		return i.get(J).then((t) => {
			e || b(t?.data?.available === !0);
		}).catch(() => {
			e || b(!1);
		}), i.get(`schemas/${c}/languages`).then((t) => {
			if (e) return;
			let n = Array.isArray(t?.data) ? t.data : [];
			w(n.filter((e) => e.code !== l));
		}).catch(() => {
			e || w([]);
		}), i.get(ne, { params: { schema_id: c } }).then((t) => {
			e || S(t?.data?.open_count ?? 0);
		}).catch(() => {
			e || S(null);
		}), () => {
			e = !0;
		};
	}, [c, l]), p(() => {
		if (c && G) return G.start(), () => G.stop();
	}, [G, c]), p(() => {
		if (c && G) return fe(G, {
			doc: document,
			win: window
		});
	}, [G, c]), p(() => {
		D === "error" && B.current?.focus();
	}, [D]);
	let Y = T !== null && !ce(T.outcome), X = C.length === 0, Z = D === "starting", Q = k ? te[k] : null, le = u === !0 && !Y, $ = m(() => ae(F, N), [F, N]), ue = oe({
		selected: N,
		summary: $
	}), me = () => {
		i.get(ne, { params: { schema_id: c } }).then((e) => {
			z.current && S(e?.data?.open_count ?? 0);
		}).catch(() => {});
	}, he = () => {
		me(), q();
	}, ge = (e) => {
		P((t) => ie(t.includes(e) ? t.filter((t) => t !== e) : [...t, e]));
	}, _e = async () => {
		if (Z) return;
		O("starting"), A(null);
		let e = await K?.start({ translationTypes: N }) ?? {
			ok: !1,
			reason: "ignored"
		};
		z.current && (e.ok ? (O("idle"), H.current = !0, G?.stop(), G?.start({
			awaitRun: !0,
			taskId: e.task?.id ?? null
		}), me(), q()) : e.reason === "pending" || e.reason === "ignored" || e.reason === "invalid" ? O("idle") : e.code === "already_running" ? (O("conflict"), G?.stop(), G?.start()) : (O("error"), A(e.code ?? "unexpected")));
	};
	return j ? /* @__PURE__ */ v("div", {
		className: "aitr-schema",
		"data-testid": "plugin-ai-translation-schema",
		children: /* @__PURE__ */ v("div", {
			className: "aitr-styles-refused",
			role: "alert",
			"data-testid": "plugin-ai-translation-schema-styles-refused",
			children: s("styles.refused.section", "The AI translation section could not be styled, so it is not shown. Manual translation still works.")
		})
	}) : /* @__PURE__ */ y("div", {
		className: "aitr-schema",
		"data-testid": "plugin-ai-translation-schema",
		children: [
			/* @__PURE__ */ v("p", {
				className: "aitr-intro",
				children: s("schema.intro", "Suggests missing translations for the kinds you select below (ObjectTypes, attributes, select options, object values, statuses and reference types) in every enabled target language. You review the suggestions in the list below; nothing is saved automatically.")
			}),
			x !== null && x > 0 && /* @__PURE__ */ v("p", {
				className: "aitr-open-count",
				"data-testid": "plugin-ai-translation-open-count",
				children: x === 1 ? s("schema.open_count.one", "{{count}} suggestion is waiting for review in this schema.", { count: x }) : s("schema.open_count.other", "{{count}} suggestions are waiting for review in this schema.", { count: x })
			}),
			T ? /* @__PURE__ */ v(ke, {
				run: T,
				surface: "schema",
				openCount: x
			}) : u === !0 && /* @__PURE__ */ y("div", {
				className: "aitr-empty",
				"data-testid": "plugin-ai-translation-empty",
				children: [/* @__PURE__ */ v("p", {
					className: "aitr-empty-title",
					children: s("schema.empty.title", "No AI translation run yet")
				}), /* @__PURE__ */ v("p", {
					className: "aitr-empty-body",
					children: s("schema.empty.body", "Start a run to get suggestions for missing translations. You review and save them in the list that appears here.")
				})]
			}),
			/* @__PURE__ */ v(Fe, {
				schemaId: c,
				reloadKey: T ? `${T.task_id}:${T.outcome}` : null,
				onChanged: he
			}),
			D === "conflict" && /* @__PURE__ */ y("div", {
				className: "aitr-notice",
				role: "status",
				"data-testid": "plugin-ai-translation-schema-conflict",
				children: [/* @__PURE__ */ v(n, {
					name: "clock",
					"aria-hidden": "true"
				}), /* @__PURE__ */ v("span", { children: s("schema.conflict.body", "An AI translation is already running for this schema. Wait for it to finish, then start again.") })]
			}),
			D === "error" && Q && /* @__PURE__ */ y("div", {
				className: "aitr-error",
				role: "alert",
				"data-testid": "plugin-ai-translation-schema-error",
				children: [
					/* @__PURE__ */ y("p", {
						ref: B,
						tabIndex: -1,
						className: "aitr-error-title",
						"data-testid": "plugin-ai-translation-schema-error-title",
						children: [/* @__PURE__ */ v(n, {
							name: "circle-alert",
							"aria-hidden": "true"
						}), s(Q.titleKey, Q.title)]
					}),
					/* @__PURE__ */ v("p", {
						className: "aitr-error-body",
						children: s(Q.bodyKey, Q.body)
					}),
					ee(k) && /* @__PURE__ */ v(e, {
						type: "button",
						variant: "outline",
						size: "sm",
						className: "h-auto min-h-8 whitespace-normal font-semibold",
						"data-testid": "plugin-ai-translation-schema-retry",
						onClick: _e,
						children: s("error.try_again", "Try again")
					})
				]
			}),
			le && /* @__PURE__ */ y("div", {
				className: "aitr-actions",
				children: [
					/* @__PURE__ */ y("fieldset", {
						className: "aitr-kinds",
						"data-testid": "plugin-ai-translation-schema-kinds",
						children: [/* @__PURE__ */ v("legend", {
							className: "aitr-kinds-legend",
							children: s("schema.kinds.legend", "Translate")
						}), /* @__PURE__ */ v("div", {
							className: "aitr-kinds-grid",
							children: re.map((e) => /* @__PURE__ */ v(t, {
								id: `aitr-schema-kind-${e}`,
								"data-testid": `plugin-ai-translation-schema-kind-${e}`,
								label: s(`schema.kinds.${e}`, e),
								checked: N.includes(e),
								onChange: () => ge(e),
								disabled: Z
							}, e))
						})]
					}),
					!X && /* @__PURE__ */ y("p", {
						className: "aitr-missing",
						role: "status",
						"aria-live": "polite",
						"data-testid": "plugin-ai-translation-schema-missing",
						children: [
							L === "loading" && s("schema.missing.loading", "Counting missing translations…"),
							L === "error" && s("schema.missing.unavailable", "The number of missing translations could not be loaded. You can still start a run."),
							L === "ready" && $ && ($.missing === 0 ? s("schema.missing.none", "No missing translations in this selection.") : /* @__PURE__ */ y(_, { children: [o($.missing === 1 ? s("schema.missing.one", "{{count}} missing translation in this selection.") : s("schema.missing.other", "{{count}} missing translations in this selection."), { count: $.missing }), $.requestable === 0 ? ` ${s("schema.missing.all_waiting", "Every missing translation in this selection already has a suggestion waiting for review.")}` : $.waiting > 0 ? ` ${o($.waiting === 1 ? s("schema.missing.waiting.one", "{{count}} of them already has a suggestion waiting for review.") : s("schema.missing.waiting.other", "{{count}} of them already have a suggestion waiting for review."), { count: $.waiting })}` : null] }))
						]
					}),
					ue === "none_selected" && /* @__PURE__ */ v("p", {
						className: "aitr-helper",
						"data-testid": "plugin-ai-translation-schema-none-selected",
						children: s("schema.kinds.none_selected", "Select at least one kind to start a run.")
					}),
					/* @__PURE__ */ v(e, {
						type: "button",
						variant: "outline",
						size: "sm",
						leftIcon: "sparkles",
						className: "h-auto min-h-8 whitespace-normal font-semibold",
						"data-testid": "plugin-ai-translation-schema-start",
						disabled: Z || X || ue !== null,
						loading: Z,
						onClick: _e,
						children: s("schema.start", "Translate schema with AI")
					}),
					X && /* @__PURE__ */ v("p", {
						className: "aitr-helper",
						"data-testid": "plugin-ai-translation-schema-prerequisite",
						children: s("schema.prerequisite", "Enable at least one target language for this schema to request translations.")
					})
				]
			})
		]
	});
}
// ../plugins/ai-translation/frontend/admin.css?inline
var Be = ".aitr-admin{flex-direction:column;gap:8px;min-width:0;display:flex}.aitr-admin .aitr-admin-row{flex-wrap:wrap;align-items:flex-start;gap:8px;display:flex}.aitr-admin .aitr-eligible,.aitr-admin .aitr-helper,.aitr-admin .aitr-review-note{max-width:65ch;color:hsl(var(--muted-foreground));overflow-wrap:anywhere;margin:0;font-size:12px;line-height:16px}.aitr-admin .aitr-review-notice{border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--foreground));overflow-wrap:anywhere;border-radius:8px;margin:0;padding:16px;font-size:14px;line-height:20px}.aitr-admin .aitr-review-heading{color:hsl(var(--foreground));overflow-wrap:anywhere;outline:none;margin:0;font-size:14px;font-weight:600;line-height:20px}.aitr-admin .aitr-review-actions{flex-wrap:wrap;gap:8px;display:flex}.aitr-admin .aitr-notice{border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--foreground));border-radius:8px;align-items:flex-start;gap:8px;padding:16px;font-size:14px;line-height:20px;display:flex}.aitr-admin .aitr-notice svg{flex:none;width:16px;height:16px}.aitr-admin .aitr-notice span{overflow-wrap:anywhere;min-width:0}.aitr-admin .aitr-error{border:1px solid hsl(var(--destructive) / .3);background:hsl(var(--destructive) / .1);border-radius:8px;flex-direction:column;gap:8px;padding:16px;display:flex}.aitr-admin .aitr-error-title{color:#b91c1c;outline:none;align-items:center;gap:8px;margin:0;font-size:14px;font-weight:600;line-height:20px;display:flex}.dark .aitr-admin .aitr-error-title{color:#f87171}.aitr-admin .aitr-error-title svg{flex:none;width:16px;height:16px}.aitr-admin .aitr-error-body{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:14px;line-height:20px}.aitr-admin .aitr-result{border:1px solid hsl(var(--border));background:hsl(var(--card));border-radius:8px;outline:none;flex-direction:column;gap:8px;padding:16px;display:flex}.aitr-admin .aitr-result-title{color:hsl(var(--foreground));align-items:center;gap:8px;margin:0;font-size:14px;font-weight:600;line-height:20px;display:flex}.aitr-admin .aitr-result-title svg{flex:none;width:16px;height:16px}.aitr-admin .aitr-result-body{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:14px;line-height:20px}.aitr-admin .aitr-skipped{flex-direction:column;gap:4px;display:flex}.aitr-admin .aitr-skipped-label{color:hsl(var(--muted-foreground));margin:0;font-size:12px;line-height:16px}.aitr-admin .aitr-skipped-list{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.aitr-admin .aitr-skipped-key{color:hsl(var(--foreground));overflow-wrap:anywhere;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:16px}.aitr-admin .aitr-styles-refused{border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--foreground));border-radius:8px;padding:16px;font-size:14px;line-height:20px}.aitr-admin .aitr-run{border:1px solid hsl(var(--border));background:hsl(var(--card));border-radius:8px;flex-direction:column;gap:8px;padding:16px;display:flex}.aitr-admin .aitr-run-title{color:hsl(var(--foreground));align-items:center;gap:8px;margin:0;font-size:14px;font-weight:600;line-height:20px;display:flex}.aitr-admin .aitr-run-title-error{color:#b91c1c}.dark .aitr-admin .aitr-run-title-error{color:#f87171}.aitr-admin .aitr-run-icon{flex:none;width:16px;height:16px}.aitr-admin .aitr-run-body{color:hsl(var(--foreground));overflow-wrap:anywhere;margin:0;font-size:14px;line-height:20px}.aitr-admin .aitr-run-bar{background:hsl(var(--muted));border-radius:9999px;width:180px;max-width:100%;height:6px;overflow:hidden}.aitr-admin .aitr-run-bar-fill{background:hsl(var(--primary));height:100%;display:block}.aitr-admin .aitr-run-started{color:hsl(var(--muted-foreground));margin:0;font-size:12px;line-height:16px}.aitr-admin .aitr-run-link{color:hsl(var(--primary));align-self:flex-start;font-size:14px;line-height:20px}.aitr-admin .aitr-run-link:focus-visible{outline:2px solid hsl(var(--ring));outline-offset:2px}@media (prefers-reduced-motion:no-preference){.aitr-admin .aitr-run-icon{animation:1s linear infinite aitr-admin-spin}}@keyframes aitr-admin-spin{0%{transform:rotate(0)}to{transform:rotate(360deg)}}@media (width<=640px){.aitr-admin .aitr-admin-row,.aitr-admin .aitr-review-actions{flex-direction:column;align-items:stretch}}", Ve = "ai-translation";
function He() {
	if (typeof document > "u") return !1;
	let e = document.querySelector("style[data-plugin-owner=\"ai-translation\"][data-plugin-style=\"admin\"]");
	return !!e && e.sheet === null;
}
function Ue({ filters: t, scopeRevision: r, canWrite: s, publishReview: c, leaveReview: l, refreshCatalog: u }) {
	let { t: m } = d(Ve), _ = t?.language ?? "en", [b, x] = g(null), [S, C] = g(0), [w, T] = g(null), [E, D] = g(null), [O, k] = g("idle"), [A, j] = g(null), [M, N] = g(!1), [P, F] = g(null), [I, L] = g(!1), [R, z] = g(!1), B = h(!0), V = h(null), H = h(null), U = h(null), W = h(t), G = h(r), K = h(null), q = h(m), J = h(null);
	W.current = t, G.current = r, K.current = {
		publishReview: c,
		leaveReview: l,
		refreshCatalog: u
	}, q.current = m;
	let ne = h(null);
	ne.current === null && (ne.current = be({
		api: i,
		getFilters: () => W.current,
		getScopeRevision: () => G.current,
		publishReview: (e) => K.current.publishReview?.(e) ?? !1,
		leaveReview: () => K.current.leaveReview?.(),
		refreshCatalog: () => K.current.refreshCatalog?.(),
		invalidReasonText: () => q.current("admin.row_invalid", "This suggestion was not saved. Edit or discard it."),
		onEvent: (e) => J.current?.(e)
	}));
	let Y = ne.current;
	J.current = (e) => {
		if (B.current) switch (e.type) {
			case "eligibility":
				x(e.eligibility), C(e.suggestionTotal);
				break;
			case "run":
				T(e.run);
				break;
			case "run_error":
				T(null);
				break;
			case "started":
				k("idle");
				break;
			case "start_error":
				k(e.code === "already_running" ? "conflict" : "error"), j(e.code);
				break;
			case "review":
				D(Y.getReview()), F(null), e.focus && U.current?.focus();
				break;
			case "review_empty":
				D(null);
				break;
			case "applied":
				D(Y.getReview()), F({
					written: e.written,
					skipped: e.skipped,
					invalid: e.invalid
				}), H.current?.focus();
				break;
			case "apply_rejected":
				F({ rejected: !0 }), H.current?.focus();
				break;
			case "apply_unknown":
				L(!0), F({ unknown: !0 }), H.current?.focus();
				break;
			case "apply_error":
				k("error"), j(e.code ?? "unexpected");
				break;
			case "discarded": D(Y.getReview());
		}
	}, p(() => (B.current = !0, () => {
		B.current = !1;
	}), []), p(() => {
		let e = a(Ve, "admin", Be);
		return (!e?.ok || He()) && z(!0), () => e?.release?.();
	}, []), p(() => {
		Y.clearReview(), D(null), F(null), _ !== "en" && Y.load();
	}, [
		Y,
		_,
		r
	]), p(() => () => Y.stop(), [Y]), p(() => {
		O === "error" && V.current?.focus();
	}, [O]);
	let X = f(async () => {
		if (O === "starting") return;
		k("starting"), j(null);
		let e = await Y.start();
		B.current && (e.ok ? (k("idle"), Y.load()) : e.reason === "pending" || e.reason === "ignored" ? k("idle") : (k(e.code === "already_running" ? "conflict" : "error"), j(e.code ?? "unexpected")));
	}, [Y, O]), re = f(async () => {
		let e = await Y.enterReview({ focus: !0 });
		B.current && e.ok && e.count > 0 && (D(Y.getReview()), F(null), U.current?.focus());
	}, [Y]), ie = f(async () => {
		N(!0);
		let e = await Y.apply();
		B.current && (N(!1), e.status === "confirmed" ? (D(Y.getReview()), F({
			written: e.written,
			skipped: e.skipped,
			invalid: e.invalid,
			results: e.results
		}), H.current?.focus()) : e.status === "unknown" ? (L(!0), F({ unknown: !0 }), H.current?.focus()) : e.status === "rejected" && (F({ rejected: !0 }), H.current?.focus()));
	}, [Y]), ae = f(async () => {
		await Y.reconcile(), B.current && (L(!1), F(null), D(Y.getReview()));
	}, [Y]);
	if (_ === "en") return null;
	if (R) return /* @__PURE__ */ v("div", {
		className: "aitr-admin",
		"data-testid": "plugin-ai-translation-admin",
		children: /* @__PURE__ */ v("div", {
			className: "aitr-styles-refused",
			role: "alert",
			"data-testid": "plugin-ai-translation-admin-styles-refused",
			children: m("styles.refused", "The AI translation action could not be styled, so it is not shown. Manual translation still works.")
		})
	});
	let oe = w !== null && !ce(w.outcome), se = O === "starting", Z = A ? te[A] : null;
	if (E && E.rows.length > 0) {
		let t = E.rows.length, r = E.total ?? t, i = (P?.results ?? []).filter((e) => e.status === "skipped").map((e) => E.rows.find((t) => t.uiStringId === String(e.suggestion_id))?.key ?? String(e.suggestion_id));
		return /* @__PURE__ */ y("div", {
			className: "aitr-admin aitr-admin-review",
			"data-testid": "plugin-ai-translation-admin",
			children: [
				/* @__PURE__ */ v("p", {
					ref: U,
					tabIndex: -1,
					className: "aitr-review-heading",
					"data-testid": "plugin-ai-translation-review-heading",
					children: o(t === 1 ? m("admin.review.heading.one", "{{count}} suggestion to review for {{language}}") : m("admin.review.heading.other", "{{count}} suggestions to review for {{language}}"), {
						count: t,
						language: _
					})
				}),
				r > t && /* @__PURE__ */ v("p", {
					className: "aitr-review-note",
					"data-testid": "plugin-ai-translation-review-showing",
					children: o(m("admin.review.showing", "Showing {{shown}} of {{total}} suggestions. Apply or discard these to see the rest."), {
						shown: t,
						total: r
					})
				}),
				!s && /* @__PURE__ */ v("p", {
					className: "aitr-review-notice",
					role: "note",
					"data-testid": "plugin-ai-translation-review-readonly",
					children: m("admin.review.readonly", "You can review these suggestions. Saving or discarding them requires permission to edit translations.")
				}),
				s && /* @__PURE__ */ v("p", {
					className: "aitr-review-note",
					children: m("admin.review.discard_help", "Discarded suggestions are not proposed again.")
				}),
				s && /* @__PURE__ */ y("div", {
					className: "aitr-review-actions",
					children: [/* @__PURE__ */ v(e, {
						type: "button",
						size: "sm",
						className: "h-auto min-h-8 whitespace-normal font-semibold",
						"data-testid": "plugin-ai-translation-review-apply",
						disabled: M || I || E.drafts.length === 0,
						loading: M,
						onClick: ie,
						children: m("admin.apply", "Apply translations")
					}), /* @__PURE__ */ v(e, {
						type: "button",
						variant: "ghost",
						size: "sm",
						className: "h-auto min-h-8 whitespace-normal font-semibold",
						"data-testid": "plugin-ai-translation-review-back",
						onClick: () => {
							Y.stop(), l?.(), D(null);
						},
						children: m("admin.review.back", "Back to all texts")
					})]
				}),
				P?.rejected && /* @__PURE__ */ y("div", {
					className: "aitr-error",
					role: "alert",
					ref: H,
					tabIndex: -1,
					"data-testid": "plugin-ai-translation-apply-rejected",
					children: [/* @__PURE__ */ y("p", {
						className: "aitr-error-title",
						children: [/* @__PURE__ */ v(n, {
							name: "circle-alert",
							"aria-hidden": "true"
						}), m("admin.apply_rejected.title", "Translations not saved")]
					}), /* @__PURE__ */ v("p", {
						className: "aitr-error-body",
						children: m("admin.apply_rejected.body", "The suggestions could not be saved. Nothing was changed. Try again.")
					})]
				}),
				P?.unknown && /* @__PURE__ */ y("div", {
					className: "aitr-error",
					role: "alert",
					ref: H,
					tabIndex: -1,
					"data-testid": "plugin-ai-translation-apply-unknown",
					children: [
						/* @__PURE__ */ y("p", {
							className: "aitr-error-title",
							children: [/* @__PURE__ */ v(n, {
								name: "circle-alert",
								"aria-hidden": "true"
							}), m("admin.apply_unknown.title", "Result unknown")]
						}),
						/* @__PURE__ */ v("p", {
							className: "aitr-error-body",
							children: m("admin.apply_unknown.body", "The response was interrupted. Check the table before applying again.")
						}),
						/* @__PURE__ */ v(e, {
							type: "button",
							variant: "outline",
							size: "sm",
							className: "h-auto min-h-8 whitespace-normal font-semibold",
							"data-testid": "plugin-ai-translation-apply-reconcile",
							onClick: ae,
							children: m("admin.apply_unknown.reconcile", "Refetch suggestions")
						})
					]
				}),
				P && !P.rejected && !P.unknown && /* @__PURE__ */ y("div", {
					className: "aitr-result",
					role: "status",
					ref: H,
					tabIndex: -1,
					"data-testid": "plugin-ai-translation-apply-result",
					children: [
						/* @__PURE__ */ y("p", {
							className: "aitr-result-title",
							children: [/* @__PURE__ */ v(n, {
								name: "circle-check",
								"aria-hidden": "true"
							}), P.written === 1 ? o(m("admin.apply_result.one", "{{written}} translation saved."), { written: P.written }) : o(m("admin.apply_result.other", "{{written}} translations saved."), { written: P.written })]
						}),
						P.skipped > 0 && /* @__PURE__ */ v("p", {
							className: "aitr-result-body",
							children: o(m("admin.apply_skipped", "{{skipped}} skipped because the text was filled in the meantime."), { skipped: P.skipped })
						}),
						P.invalid > 0 && /* @__PURE__ */ v("p", {
							className: "aitr-result-body",
							children: o(m("admin.apply_invalid", "{{invalid}} not saved; see the marked rows."), { invalid: P.invalid })
						}),
						i.length > 0 && /* @__PURE__ */ y("div", {
							className: "aitr-skipped",
							children: [/* @__PURE__ */ v("p", {
								className: "aitr-skipped-label",
								children: m("admin.skipped_label", "Skipped keys")
							}), /* @__PURE__ */ v("ul", {
								className: "aitr-skipped-list",
								children: i.map((e) => /* @__PURE__ */ v("li", {
									className: "aitr-skipped-key",
									children: e
								}, e))
							})]
						})
					]
				})
			]
		});
	}
	let Q = b !== null && b.state === "eligible" && !oe;
	return /* @__PURE__ */ y("div", {
		className: "aitr-admin",
		"data-testid": "plugin-ai-translation-admin",
		children: [
			/* @__PURE__ */ y("div", {
				className: "aitr-admin-row",
				children: [Q && /* @__PURE__ */ v(e, {
					type: "button",
					variant: "outline",
					size: "sm",
					leftIcon: "sparkles",
					className: "h-auto min-h-8 whitespace-normal font-semibold",
					"data-testid": "plugin-ai-translation-admin-start",
					disabled: se,
					loading: se,
					onClick: X,
					children: m("admin.action", "Translate with AI")
				}), S > 0 && /* @__PURE__ */ v(e, {
					type: "button",
					variant: "outline",
					size: "sm",
					className: "h-auto min-h-8 whitespace-normal font-semibold",
					"data-testid": "plugin-ai-translation-admin-review",
					onClick: re,
					children: o(S === 1 ? m("admin.review.one", "Review {{count}} suggestion") : m("admin.review.other", "Review {{count}} suggestions"), { count: S })
				})]
			}),
			b?.state === "eligible" && /* @__PURE__ */ v("p", {
				className: "aitr-eligible",
				"data-testid": "plugin-ai-translation-admin-eligible",
				children: b.eligibleTotal === 1 ? o(m("admin.eligible.one", "{{count}} missing text in this filter can be translated. One run covers up to 100."), { count: b.eligibleTotal }) : o(m("admin.eligible.other", "{{count}} missing texts in this filter can be translated. One run covers up to 100."), { count: b.eligibleTotal })
			}),
			b?.state === "none_missing" && /* @__PURE__ */ v("p", {
				className: "aitr-helper",
				"data-testid": "plugin-ai-translation-admin-none",
				children: m("admin.nothing_missing", "No missing translations in this filter.")
			}),
			b?.state === "missing_not_eligible" && /* @__PURE__ */ v("p", {
				className: "aitr-helper",
				"data-testid": "plugin-ai-translation-admin-ineligible",
				children: m("admin.missing_not_eligible", "The missing texts in this filter can't be translated with AI. They are technical strings, already have an open suggestion, or were discarded before. Translate them manually.")
			}),
			w && /* @__PURE__ */ v(ke, {
				run: w,
				surface: "admin",
				languageName: _
			}),
			O === "conflict" && /* @__PURE__ */ y("div", {
				className: "aitr-notice",
				role: "status",
				"data-testid": "plugin-ai-translation-admin-conflict",
				children: [/* @__PURE__ */ v(n, {
					name: "clock",
					"aria-hidden": "true"
				}), /* @__PURE__ */ v("span", { children: o(m("admin.conflict.body", "An AI translation for {{language}} is already in progress. Wait for it to finish, then start the next block."), { language: _ }) })]
			}),
			O === "error" && Z && /* @__PURE__ */ y("div", {
				className: "aitr-error",
				role: "alert",
				"data-testid": "plugin-ai-translation-admin-error",
				children: [
					/* @__PURE__ */ y("p", {
						ref: V,
						tabIndex: -1,
						className: "aitr-error-title",
						"data-testid": "plugin-ai-translation-admin-error-title",
						children: [/* @__PURE__ */ v(n, {
							name: "circle-alert",
							"aria-hidden": "true"
						}), m(Z.titleKey, Z.title)]
					}),
					/* @__PURE__ */ v("p", {
						className: "aitr-error-body",
						children: m(Z.bodyKey, Z.body)
					}),
					ee(A) && /* @__PURE__ */ v(e, {
						type: "button",
						variant: "outline",
						size: "sm",
						className: "h-auto min-h-8 whitespace-normal font-semibold",
						"data-testid": "plugin-ai-translation-admin-retry",
						onClick: X,
						children: m("error.try_again", "Try again")
					})
				]
			})
		]
	});
}
// ../plugins/ai-translation/frontend/index.jsx
var We = "ai-translation:data", Ge = "ai-translation:ui";
function Ke(e) {
	return K({
		api: i,
		entityType: e?.entityType,
		entityId: e?.entityId
	});
}
function qe(e) {
	return me({
		api: i,
		schemaId: e?.schemaId
	});
}
function Je(e) {
	return _e({
		api: i,
		language: e?.language
	});
}
var Ye = {
	translations: {
		en: S,
		de: C,
		es: w,
		fr: T,
		pt: E
	},
	translationPanelActions: [{
		id: "field-translation",
		label: "Translate with AI",
		labelKey: "panel.action",
		permission: We,
		isPresent: Ke,
		component: we
	}],
	schemaSettingsSections: [{
		id: "schema-translation",
		label: "AI translation",
		labelKey: "schema.heading",
		permission: We,
		isPresent: qe,
		component: ze
	}],
	translationAdminActions: [{
		id: "ui-translation",
		label: "Translate with AI",
		labelKey: "admin.action",
		permission: Ge,
		isPresent: Je,
		component: Ue
	}]
};
export { Ye as default };
