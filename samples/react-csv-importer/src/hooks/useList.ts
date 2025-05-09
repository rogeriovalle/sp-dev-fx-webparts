import * as React from 'react';
import { SPFI, IFieldInfo, FieldTypes, IListInfo, IListItemFormUpdateValue } from '@pnp/sp/presets/all';
import { Logger, LogLevel } from '@pnp/logging';
import { ISpoFiled } from '../entities';
import { getSp } from "../utils";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const useList = (listId: string, chunkSize: number) => {
    const LOG_SOURCE = 'useList';
    const MAX_BATCH_OPERATIONS = chunkSize;

    const sp: SPFI = React.useMemo(() => getSp(), []);

    const [listTitle, setListTitle] = React.useState<string>("");
    const [fields, setFields] = React.useState<ISpoFiled[]>([]);

    const getList = React.useCallback(async (listId: string): Promise<IListInfo> => {
        if (!sp || !listId) return undefined;
        return await sp.web.lists
            .getById(listId)
            .select("Title", "ParentWebUrl")();
    }, [sp]);

    const getListColumns = React.useCallback(async (listId: string): Promise<ISpoFiled[]> => {
        if (!sp || !listId) return undefined;
        const fields: IFieldInfo[] = await sp.web
            .lists
            .getById(listId)
            .fields();

        return fields
            .filter((field) => !field.ReadOnlyField &&
                !field.Hidden &&
                field.FieldTypeKind !== FieldTypes.Attachments &&
                field.FieldTypeKind !== FieldTypes.Computed)
            .map((field) => ({
                InternalName: field.InternalName,
                Title: field.Title,
                Required: field.Required,
                Type: field.TypeAsString
            }));
    }, [sp]);

    const addListItemsWithBatching = React.useCallback(async (listInfo: IListInfo, items: { [name: string]: unknown; }[]): Promise<IListItemFormUpdateValue[][]> => {
        if (!sp || !listId) return undefined;
        const [batchedWeb, execute] = sp.web.batched();
        const result: IListItemFormUpdateValue[][] = [];
        items.forEach((row) => {
            const formValues: IListItemFormUpdateValue[] = [];
            Object.keys(row).forEach((key) => formValues.push({ FieldName: key, FieldValue: row[key]?.toString() ?? "" }));
            batchedWeb.lists
                .getById(listId)
                .addValidateUpdateItemUsingPath(formValues,
                    `${listInfo.ParentWebUrl !== '/' ? listInfo.ParentWebUrl : ''}/Lists/${listInfo.Title}`)
                .then(r => {
                    const errors = r.filter(field => field.ErrorMessage !== null);
                    if (errors.length > 0) {
                        result.push(errors);
                        Logger.write(`${LOG_SOURCE} - addListItemsWithBatching - ${JSON.stringify(errors)}`, LogLevel.Error);
                    }
                })
                .catch(error => {
                    result.push([{ ErrorMessage: error.message }]);
                    Logger.write(`${LOG_SOURCE} - addListItemsWithBatching - ${error.message}`, LogLevel.Error);
                });
        });
        await execute();
        return result;
    }, [sp]);

    const addListItems = React.useCallback(async (listId: string, items: { [name: string]: unknown; }[]): Promise<IListItemFormUpdateValue[][]> => {
        const result: IListItemFormUpdateValue[][] = [];
        try {
            const listInfo: IListInfo = await getList(listId);
            for (let i = 0; i < items.length; i += MAX_BATCH_OPERATIONS) {
                const batch = items.slice(i, i + MAX_BATCH_OPERATIONS);
                Logger.write(`${LOG_SOURCE} - addListItems - Processing batch: ${i} - ${i + batch.length}`, LogLevel.Info);
                result.push(...await addListItemsWithBatching(listInfo, batch));
            }
        } catch (error) {
            result.push([{ ErrorMessage: error.message }]);
            Logger.write(`${LOG_SOURCE} - addListItems - ${error.message}`, LogLevel.Error);
        }
        return result;
    }, [sp, MAX_BATCH_OPERATIONS]);

    React.useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        (async (): Promise<void> => {
            setListTitle((await getList(listId)).Title);
            setFields(await getListColumns(listId));
        })();
    }, [listId]);

    return {
        getList,
        getListColumns,
        addListItems,
        listTitle,
        fields
    }
}
