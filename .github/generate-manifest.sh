#!/bin/bash
mkdir output
DOWNLOAD_URL_PREFIX="https://raw.githubusercontent.com/sensible-hq/sensible-sample-documents/main/"
LINES=$(find . -name "*.*" | grep -v "\/\." | grep ".json\|.pdf")
CONFIGS=$(echo "$LINES" | grep "config.json")
MANIFEST=$(
for config in $CONFIGS; do
    files=()
    config_path=(${config//\// })
    associated_jsons=$(echo "$LINES" | grep -v "config.json" | grep ".json" | grep "/${config_path[1]}/")

    for json in $associated_jsons; do
        jsonPath=(${json//\.\// })
        fileNameJson=(${json//\.json/ })
        fileName=(${fileNameJson//\// })
        pdfFiles=$(echo "$LINES" | grep -v ".json" | grep "${fileName[1]}_sample") 
        for pdfFile in $pdfFiles; do
            if grep -q "$pdfFile" <<< "$LINES";
            then
                if ! grep -q "$jsonPathString" <<< "${files[@]}"; 
                then
                    files+=("{\"path\":\"${jsonPath}\",\"download_url\":\"${DOWNLOAD_URL_PREFIX}${jsonPath}\"}")
                fi
                pdfPath=(${pdfFile//\.\// })
                files+=("{\"path\":\"${pdfPath}\",\"download_url\":\"${DOWNLOAD_URL_PREFIX}${pdfPath}\"}")
            fi
        done
    done

    jsonFiles=$(echo "${files[@]}" | jq -r '{path:.path, download_url:.download_url}' | jq -s)

    echo $(
        cat $config | jq -r --arg config_path ${config_path[1]} --argjson jsonFiles "${jsonFiles[@]}" '{
        config_data: {
            path: $config_path,
            category: .category,
            description: .description,
            display_name: .display_name,
            icon: .icon,
        },
        files: $jsonFiles
    }')
done | jq -s )
echo $MANIFEST >> output/manifest.json
